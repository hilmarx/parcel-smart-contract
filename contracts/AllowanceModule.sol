// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "./Enum.sol";
import "./SignatureDecoder.sol";
import "./interfaces/FeedRegistryInterface.sol";
import "./lib/DSMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20Decimal is IERC20{
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function decimals() external view returns (uint256);
}

interface GnosisSafe {
    /// @dev Allows a Module to execute a Safe transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, Enum.Operation operation)
        external
        returns (bool success);
}

contract AllowanceModule is SignatureDecoder, Ownable, DSMath {

    string public constant NAME = "Allowance Module";
    string public constant VERSION = "0.1.0";

    // solhint-disable-next-line var-name-mixedcase
    FeedRegistryInterface internal registry;
    address payable public GELATO;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public DenominationsUSD = 0x0000000000000000000000000000000000000348;
    address public Chainlink_Registery = 0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf;

    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH = 0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );

    bytes32 public constant ALLOWANCE_TRANSFER_TYPEHASH = 0x80b006280932094e7cc965863eb5118dc07e5d272c6670c4a7c87299e04fceeb;
    // keccak256(
    //     "AllowanceTransfer(address safe,address token,uint96 amount,address paymentToken,uint96 payment,uint16 nonce)"
    // );

    // Safe -> Delegate -> Allowance
    mapping(address => mapping (address => mapping(address => Allowance))) public allowances;
    // Safe -> maxGasPrice
    mapping(address => uint256) public maxGasPrice;
    // Safe -> Delegate -> Tokens
    mapping(address => mapping (address => address[])) public tokens;
    // Safe -> Delegates double linked list entry points
    mapping(address => uint48) public delegatesStart;
    // Safe -> Delegates double linked list
    mapping(address => mapping (uint48 => Delegate)) public delegates;

    // We use a double linked list for the delegates. The id is the first 6 bytes. 
    // To double check the address in case of collision, the address is part of the struct.
    struct Delegate {
        address delegate;
        uint48 prev;
        uint48 next;
    }

    // The allowance info is optimized to fit into one word of storage.
    struct Allowance {
        uint256 fiatAmount;
        uint96 tokenAmount;
        uint96 spent;
        uint16 nonce;
        uint16 resetTimeMin; // Maximum reset time span is 65k minutes
        uint32 lastResetMin;
        int8 endsOn;
    }

    int8 public immutable notEndsOn = -1;
    uint256 public gasCost = 10**6;
    uint256 public one_ether = 10**18;
    uint256 public priceTimeThresold = 2 days;
    uint96 public totalGasPayment;

    event AddDelegate(address indexed safe, address delegate);
    event RemoveDelegate(address indexed safe, address delegate);
    event ExecuteAllowanceTransfer(address indexed safe, address delegate, address token, address to, uint96 value, uint16 nonce);
    event PayAllowanceTransfer(address indexed safe, address delegate, address paymentToken, address paymentReceiver, uint96 payment);
    event SetAllowance(address indexed safe, address delegate, address token, uint96 tokenAmount, uint256 fiatAmount, uint16 resetTime);
    event ResetAllowance(address indexed safe, address delegate, address token);
    event DeleteAllowance(address indexed safe, address delegate, address token);
    event NewMaxGasPrice(address indexed safe, uint256 newMaxGasPrice);
    event SetRegistery(address indexed oldRegistery, address indexed newRegistery);
    event SetGelatoAddress(address indexed oldGelato, address indexed newGelato);
    event SetGasCost(uint256 oldGasCost, uint256 newGasCost);
    event SetPriceThresold(uint256 oldPriceTimeThresold, uint256 newPriceTimeThresold);
    event IndividualSuccess(address indexed safe, address delegate, address token, address to, uint96 value);
    event IndividualFailed(address indexed safe, address delegate, address token, address to, uint96 value);
    event SetDenominationsUSD(address indexed oldDenominationsUSD, address indexed newDenominationsUSD);

    constructor(address payable _gelato) {
        GELATO = _gelato;
        registry = FeedRegistryInterface(Chainlink_Registery);
    }

    /// @dev Allows to update the allowance for a specified token. This can only be done via a Safe transaction.
    /// @param delegate Delegate whose allowance should be updated.
    /// @param token Token contract address.
    /// @param tokenAmount allowance in smallest token unit.
    /// @param fiatAmount allowance in fiat.
    /// @param resetTimeMin Time after which the allowance should reset
    /// @param resetBaseMin Time based on which the reset time should be increased
    function setAllowance(
        address delegate, address token, uint96 tokenAmount, uint256 fiatAmount, 
        uint16 resetTimeMin, uint32 resetBaseMin, int8 endsOn
    )
        public
    {
        require(delegate != address(0), "delegate != address(0)");
        require(delegates[msg.sender][uint48(delegate)].delegate == delegate, "delegates[msg.sender][uint48(delegate)].delegate == delegate");
        require((tokenAmount != 0 || fiatAmount != 0) && (tokenAmount == 0 || fiatAmount == 0), "One should zero and one non-zero");
        Allowance memory allowance = getAllowance(msg.sender, delegate, token);
        if (allowance.nonce == 0) { // New token
            // Nonce should never be 0 once allowance has been activated
            allowance.nonce = 1;
            tokens[msg.sender][delegate].push(token);
        }
        // Divide by 60 to get current time in minutes
        // solium-disable-next-line security/no-block-members
        uint32 currentMin = uint32(block.timestamp / 60);
        if (resetBaseMin > 0) {
            require(resetBaseMin <= currentMin, "resetBaseMin <= currentMin");
            allowance.lastResetMin = currentMin - ((currentMin - resetBaseMin) % resetTimeMin);
        } else if (allowance.lastResetMin == 0) {
            allowance.lastResetMin = currentMin;
        }
        allowance.resetTimeMin = resetTimeMin;
        allowance.tokenAmount = tokenAmount;
        allowance.fiatAmount = fiatAmount;
        allowance.endsOn = endsOn > 0 ? endsOn : notEndsOn;

        updateAllowance(msg.sender, delegate, token, allowance);
        emit SetAllowance(msg.sender, delegate, token, tokenAmount, fiatAmount, resetTimeMin);
    }

    // calculate token quantity from fiat amount
    function getTokenQuantity(uint256 fiatAmount, address token)
        public view returns(uint96 tokenQuantity)
    {
        // Call Chainlink registery to fetch price and priceDecimals
        (int tokenPrice, uint256 priceDecimals) = getLatestPrice(token);
        uint256 tokenDecimals = token == ETH ? 18 : IERC20Decimal(token).decimals();
        uint256 diffDecimal = 18 - priceDecimals;
        tokenPrice = tokenPrice * int256(10 ** diffDecimal);
        tokenQuantity = uint96(wdiv(fiatAmount, uint(tokenPrice)));
        if (tokenDecimals != 18) {
            tokenQuantity = uint96(tokenQuantity * (10 ** tokenDecimals) / (one_ether));
        }
    }

    // chainlink price integration
    function getLatestPrice(address _token) public view returns (int, uint8) {
        (,int price,,uint timeStamp,) = registry.latestRoundData(_token, DenominationsUSD);
        require(price > 0, "Prize should not be negative.");
        uint8 decimals = registry.decimals(_token, DenominationsUSD);
        uint256 timeDiff = block.timestamp - timeStamp;
        require(timeDiff < priceTimeThresold, "Timestamp is old");
        return (price, decimals);
    }

    function getAllowance(address safe, address delegate, address token) private view returns (Allowance memory allowance) {
        allowance = allowances[safe][delegate][token];
        // solium-disable-next-line security/no-block-members
        uint32 currentMin = uint32(block.timestamp / 60);
        // Check if we should reset the time. We do this on load to minimize storage read/ writes
        if (allowance.resetTimeMin > 0 && allowance.lastResetMin <= currentMin - allowance.resetTimeMin) {
            allowance.spent = 0;
            // Resets happen in regular intervals and `lastResetMin` should be aligned to that
            allowance.lastResetMin = currentMin - ((currentMin - allowance.lastResetMin) % allowance.resetTimeMin);
        }
        return allowance;
    }

    function updateAllowance(address safe, address delegate, address token, Allowance memory allowance) private {
        allowances[safe][delegate][token] = allowance;
    }

    /// @dev Allows to reset the allowance for a specific delegate and token.
    /// @param delegate Delegate whose allowance should be updated.
    /// @param token Token contract address.
    function resetAllowance(address delegate, address token) public {
        Allowance memory allowance = getAllowance(msg.sender, delegate, token);
        allowance.spent = 0;
        updateAllowance(msg.sender, delegate, token, allowance);
        emit ResetAllowance(msg.sender, delegate, token);
    }

    /// @dev Allows to remove the allowance for a specific delegate and token. This will set all values except the `nonce` to 0.
    /// @param delegate Delegate whose allowance should be updated.
    /// @param token Token contract address.
    function deleteAllowance(address delegate, address token)
        public
    {
        Allowance memory allowance = getAllowance(msg.sender, delegate, token);
        allowance.tokenAmount = 0;
        allowance.fiatAmount = 0;
        allowance.spent = 0;
        allowance.resetTimeMin = 0;
        allowance.lastResetMin = 0;
        allowance.endsOn = 0;
        updateAllowance(msg.sender, delegate, token, allowance);
        emit DeleteAllowance(msg.sender, delegate, token);
    }

    /// @dev Allows to use the allowance to perform a transfer.
    /// @param safe The Safe whose funds should be used.
    /// @param token Token contract address.
    /// @param to Address that should receive the tokens.
    /// @param amount Amount that should be transferred.
    /// @param payment Amount to should be paid for executing the transfer.
    /// @param delegate Delegate whose allowance should be updated.
    /// @param signature Signature generated by the delegate to authorize the transfer.
    function executeAllowanceTransfer(
        GnosisSafe safe,
        address token,
        address payable to,
        uint96 amount,
        uint96 payment,
        address delegate,
        bytes memory signature
    ) public returns(uint256 tokenQuantity){
        tokenQuantity = executeAllowanceTransferInternal(safe, token, to, amount, payment, delegate, signature);
        gasPayment(safe);
    }

        /// @dev Allows to use the allowance to perform a transfer to multiple users.
    /// @param safe The Safe whose funds should be used.
    /// @param token Token contract address.
    /// @param to Address that should receive the tokens.
    /// @param amount Amount that should be transferred.
    /// @param payment Amount to should be paid for executing the transfer.
    /// @param delegate Delegate whose allowance should be updated.
    /// @param signature Signature generated by the delegate to authorize the transfer.
    function multipleExecuteAllowanceTransfer(
        GnosisSafe safe,
        address[] memory token,
        address[] memory to,
        uint96[] memory amount,
        uint96[] memory payment,
        address[] memory delegate,
        bytes[] memory signature
    ) public {
        require(address(safe) != address(0), "Safe Address should not be zero");
        require(amount.length == token.length 
            && amount.length == to.length && amount.length == payment.length 
            && amount.length == delegate.length && amount.length == signature.length, "Array length mismatch");
        for (uint i = 0; i < amount.length; i++) {
            bytes4 selector = this.executeAllowanceTransferInternal.selector;
            bytes memory data = abi.encodeWithSelector(selector, safe, token[i], payable(to[i]), amount[i], payment[i], delegate[i], signature[i]);
            (bool success, bytes memory returnedData) = address(this).call(data);
            if (success) {
                emit IndividualSuccess(address(safe), delegate[i], token[i], to[i], abi.decode(returnedData, (uint96)));
            } else {
                emit IndividualFailed(address(safe), delegate[i], token[i], to[i], 0);
            }
        }
        gasPayment(safe);
    }

    /// @dev Allows to use the allowance to perform a transfer.
    /// @param safe The Safe whose funds should be used.
    /// @param token Token contract address.
    /// @param to Address that should receive the tokens.
    /// @param amount Amount that should be transferred.
    /// @param payment Amount to should be paid for executing the transfer.
    /// @param delegate Delegate whose allowance should be updated.
    /// @param signature Signature generated by the delegate to authorize the transfer.
    function executeAllowanceTransferInternal(
        GnosisSafe safe,
        address token,
        address payable to,
        uint96 amount,
        uint96 payment,
        address delegate,
        bytes memory signature
    ) public returns(uint256){
        // Get current state
        Allowance memory allowance = getAllowance(address(safe), delegate, token);

        if (allowance.endsOn != notEndsOn) {
            require(allowance.endsOn > 0, "This address's recurring expired.");
            allowance.endsOn = allowance.endsOn - 1;
        }

        uint96 tokenQuantity;
        uint96 newSpent = allowance.spent + amount;
        if (allowance.fiatAmount > 0) {
            // Calculate TokenQunatity from fiatAmount(amount)
            require(token != address(0), "Oracle not specified for this token");
            uint96 tokenQuantity = getTokenQuantity(amount, token);
            require(tokenQuantity != 0, "Token Quantity Can't be Zero");

            // Check new spent fiatAmount and overflow
            require(newSpent > allowance.spent && newSpent <= allowance.fiatAmount, "newSpent > allowance.spent && newSpent <= allowance.fiatAmount");

        } else {
            tokenQuantity = amount;

            // Check new spent tokenQuantity and overflow
            require(newSpent > allowance.spent && newSpent <= allowance.tokenAmount, "newSpent > allowance.spent && newSpent <= allowance.tokenAmount");
        }
        allowance.spent = newSpent;
        bytes memory transferHashData = generateTransferHashData(address(safe), token, to, tokenQuantity, allowance.nonce);

        allowance.nonce = allowance.nonce + 1;
        updateAllowance(address(safe), delegate, token, allowance);

        // Perform external interactions
        // Check signature
        checkSignature(delegate, signature, transferHashData, safe);

        if (payment > 0 && msg.sender == GELATO) {
            require(tx.gasprice <= maxGasPrice[address(safe)], "tx.gasprice is > maxGas price");
            require(payment <= maxGasPrice[address(safe)] * gasCost, "Gas fees > allowed"); // deterministic gas calculation
            totalGasPayment = totalGasPayment + payment;
            // solium-disable-next-line security/no-tx-origin
            emit PayAllowanceTransfer(address(safe), delegate, ETH, tx.origin, payment);
        }

        // Transfer token
        transfer(safe, token, to, tokenQuantity);
        emit ExecuteAllowanceTransfer(address(safe), delegate, token, to, tokenQuantity, allowance.nonce - 1);
        return tokenQuantity;
    }

    function gasPayment(GnosisSafe safe) internal {
        if (totalGasPayment > 0 && msg.sender == GELATO) {
            uint96 gasPayment = totalGasPayment;
            totalGasPayment = 0;
            // Transfer payment
            // solium-disable-next-line security/no-tx-origin
            transfer(safe, ETH, GELATO, gasPayment);
        }
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public pure returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    /// @dev Generates the data for the transfer hash (required for signing)
    function generateTransferHashData(
        address safe,
        address token,
        address to,
        uint96 amount,
        uint16 nonce
    ) private view returns (bytes memory) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 transferHash = keccak256(
            abi.encode(ALLOWANCE_TRANSFER_TYPEHASH, safe, token, to, amount, ETH, nonce)
        );
        return abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, transferHash);
    }

    /// @dev Generates the transfer hash that should be signed to authorize a transfer
    function generateTransferHash(
        address safe,
        address token,
        address to,
        uint96 amount,
        uint16 nonce
    ) public view returns (bytes32) {
        return keccak256(generateTransferHashData(
            safe, token, to, amount, nonce
        ));
    }

    function checkSignature(address expectedDelegate, bytes memory signature, bytes memory transferHashData, GnosisSafe safe) private view {
        address signer = recoverSignature(signature, transferHashData);
        require(
            (expectedDelegate == signer && delegates[address(safe)][uint48(signer)].delegate == signer) || msg.sender == GELATO,
            "expectedDelegate == signer && delegates[address(safe)][uint48(signer)].delegate == signer"
        );
    }

    // We use the same format as used for the Safe contract, except that we only support exactly 1 signature and no contract signatures.
    function recoverSignature(bytes memory signature, bytes memory transferHashData) private view returns (address owner) {
        // If there is no signature data msg.sender should be used
        if (signature.length == 0) return msg.sender;
        // Check that the provided signature data is as long as 1 encoded ecsda signature
        require(signature.length == 65, "signatures.length == 65");
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = signatureSplit(signature, 0);
        // If v is 0 then it is a contract signature
        if (v == 0) {
            revert("Contract signatures are not supported by this module");
        } else if (v == 1) {
            // If v is 1 we also use msg.sender, this is so that we are compatible to the GnosisSafe signature scheme
            owner = msg.sender;
        } else if (v > 30) {
            // To support eth_sign and similar we adjust v and hash the transferHashData with the Ethereum message prefix before applying ecrecover
            owner = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(transferHashData))), v - 4, r, s);
        } else {
            // Use ecrecover with the messageHash for EOA signatures
            owner = ecrecover(keccak256(transferHashData), v, r, s);
        }
        // 0 for the recovered owner indicates that an error happened.
        require(owner != address(0), "owner != address(0)");
    }

    function transfer(GnosisSafe safe, address token, address payable to, uint96 amount) private {
        if (token == ETH) {
            // solium-disable-next-line security/no-send
            require(safe.execTransactionFromModule(to, amount, "", Enum.Operation.Call), "Could not execute ether transfer");
        } else {
            bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", to, amount);
            require(safe.execTransactionFromModule(token, 0, data, Enum.Operation.Call), "Could not execute token transfer");
        }
    }

    function getTokens(address safe, address delegate) public view returns (address[] memory) {
        return tokens[safe][delegate];
    }

    function getTokenAllowance(address safe, address delegate, address token) public view returns (uint256[5] memory) {
        Allowance memory allowance = getAllowance(safe, delegate, token);
        require(token != address(0), "Token address should not address(0)");
        uint256 allowanceOfToken = allowance.tokenAmount;
        if (allowance.fiatAmount > 0) {
            allowanceOfToken = uint256(getTokenQuantity(allowance.fiatAmount, token));
        }
        return [
            allowanceOfToken,
            uint256(allowance.spent),
            uint256(allowance.resetTimeMin),
            uint256(allowance.lastResetMin),
            uint256(allowance.nonce)
        ];
    }

    function getEndsOn(address safe, address delegate, address token) public view returns (int8) {
        Allowance memory allowance = getAllowance(safe, delegate, token);
        return allowance.endsOn;
    }

    /// @dev Allows to add a delegate.
    /// @param delegate Delegate that should be added.
    function addDelegate(address delegate) public {
        uint48 index = uint48(delegate);
        require(index != uint(0), "index != uint(0)");
        address currentDelegate = delegates[msg.sender][index].delegate;
        if(currentDelegate != address(0)) {
            // We have a collision for the indices of delegates
            require(currentDelegate == delegate, "currentDelegate == delegate");
            // Delegate already exists, nothing to do
            return;
        }
        uint48 startIndex = delegatesStart[msg.sender];
        delegates[msg.sender][index] = Delegate(delegate, 0, startIndex);
        delegates[msg.sender][startIndex].prev = index;
        delegatesStart[msg.sender] = index;
        emit AddDelegate(msg.sender, delegate);
    }

    /// @dev Allows to add a set max gas price for user
    /// @param newMaxGasPrice New Max Gas Price to set.
    function setMaxGasPrice(uint256 newMaxGasPrice) public {
        maxGasPrice[msg.sender] = newMaxGasPrice;
        emit NewMaxGasPrice(msg.sender, newMaxGasPrice);
    }

    /// @dev Allows to remove a delegate.
    /// @param delegate Delegate that should be removed.
    /// @param removeAllowances Indicator if allowances should also be removed. This should be set to `true` unless this causes an out of gas, in this case the allowances should be "manually" deleted via `deleteAllowance`.
    function removeDelegate(address delegate, bool removeAllowances) public {
        Delegate memory current = delegates[msg.sender][uint48(delegate)];
        // Delegate doesn't exists, nothing to do
        if(current.delegate == address(0)) return;
        if (removeAllowances) {
            address[] storage delegateTokens = tokens[msg.sender][delegate];
            for (uint256 i = 0; i < delegateTokens.length; i++) {
                address token = delegateTokens[i];
                // Set all allowance params except the nonce to 0
                Allowance memory allowance = getAllowance(msg.sender, delegate, token);
                allowance.tokenAmount = 0;
                allowance.fiatAmount = 0;
                allowance.spent = 0;
                allowance.resetTimeMin = 0;
                allowance.lastResetMin = 0;
                allowance.endsOn = 0;
                updateAllowance(msg.sender, delegate, token, allowance);
                emit DeleteAllowance(msg.sender, delegate, token);
            }
        }
        if (current.prev == 0) {
            delegatesStart[msg.sender] = current.next;
        } else {
            delegates[msg.sender][current.prev].next = current.next;
        }
        if (current.next != 0) {
            delegates[msg.sender][current.next].prev = current.prev;
        }
        delete delegates[msg.sender][uint48(delegate)];
        emit RemoveDelegate(msg.sender, delegate);
    }

    function getDelegates(address safe, uint48 start, uint8 pageSize) public view returns (address[] memory results, uint48 next) {
        results = new address[](pageSize);
        uint8 i = 0;
        uint48 initialIndex = (start != 0) ? start : delegatesStart[safe];
        Delegate memory current = delegates[safe][initialIndex];
        while(current.delegate != address(0) && i < pageSize) {
            results[i] = current.delegate;
            i++;
            current = delegates[safe][current.next];
        }
        next = uint48(current.delegate);
        // Set the length of the array the number that has been used.
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            mstore(results, i)
        }
    }

    function setRegistery(address newRegistery) public onlyOwner {
        require(newRegistery != address(0), "Address Can't be Zero");
        address oldRegistery = Chainlink_Registery;
        Chainlink_Registery = newRegistery;
        emit SetRegistery(oldRegistery, newRegistery);
    }

    function setDenominationsUSD(address newDenominationsUSD) public onlyOwner {
        require(newDenominationsUSD != address(0), "Address Can't be Zero");
        address oldDenominationsUSD = DenominationsUSD;
        DenominationsUSD = newDenominationsUSD;
        emit SetDenominationsUSD(oldDenominationsUSD, newDenominationsUSD);
    }

    function setGelatoAddress(address payable newGelato) public onlyOwner {
        require(newGelato != address(0), "Address Can't be Zero");
        address oldGelato = GELATO;
        GELATO = newGelato;
        emit SetGelatoAddress(oldGelato, newGelato);
    }

    function setGasCost(uint256 newGasCost) public onlyOwner {
        require(newGasCost > 0, "Gas Cost Can't be Zero");
        uint256 oldGasCost = gasCost;
        gasCost = newGasCost;
        emit SetGasCost(oldGasCost, newGasCost);
    }

    function setPriceThresold(uint256 newPriceTimeThresold) public onlyOwner {
        require(newPriceTimeThresold > 0, "Price thresold Can't be Zero");
        uint256 oldPriceTimeThresold = priceTimeThresold;
        priceTimeThresold = newPriceTimeThresold;
        emit SetPriceThresold(oldPriceTimeThresold, newPriceTimeThresold);
    }
}
