## Changes

1). EndsOn
- In `SetAllowance` function added endsOn param to stop recurring payment
- and `executeAllowanceTransfer` in i have checked endOn param and decrease by one each time and once it reaches thresold it stop to giving payment
- One more variable, `notEndsOn` which is set to -1 for if user does not want to stop recurring param

2). Chainlink Integration
- If user wants to give allowance in fiat amount then price oracle will be needed.
- When user give fiatAmount we will calculate corresponding quantity of token to give allowance.
- there is one more fact, if allowance in fiat is $500 and price of token is $1000,
  - then 500/1000 = 0.5 eth, this calculation is not possible in solidity so we have used one open-source library `FixidityLib`.
  - `getTokenQuantity`:  This function is used to calculate token quantity and consume FixidityLib to calculate decimal places in solidity. 
  `FixidityLib Link:  https://github.com/CementDAO/Fixidity/blob/master/contracts/FixidityLib.sol`
  

3). SetGelatoAdddress
- If owner wants to change Gelato address then owner can set using this function

4). SetMaxGasPrice
- There is one `maxGasPrice` mapping. using that delegate can set max gas price when gelato execute payment for them.

5). checkSignature
- In Check signature, We have added one more require to allow Gelato address to call execution of payment to delegate

6). Remove payment params.
- Removed unnecessary payment params from generateTransferHash, generateTransferHashData, executeAllowanceTransfer

7). ETH address
- added hardcoded ETH address for transfer function if token address is ETH then it should pay in eth token.

8). Multiple Execute AllowanceTransfer
- `multiExecuteAllowanceTransfer` is function in a contract that wraps `executeAllowanceTransfer` in a for loop. It is like Batch Call of `executeAllowanceTransfer` which is call by `gelato`. 
- In this function there is one params called bytes[] which is not possible without `pragma experimental ABIEncoderV2;`. So added in Line.No: 2.

## Start Ganache-cli for mainnet fork in terminal1

ganache-cli --fork https://mainnet.infura.io/v3/--Infura-Key-- \
 --unlock 0xB045FA6893B26807298E93377Cbb92d7f37B19eB --allowUnlimitedContractSize

`0xB045FA6893B26807298E93377Cbb92d7f37B19eB: <- this address id of UNI rich holder address to impersonate`

## Running and Compiling tests in different terminal2

truffle compile
truffle test

## Deploy

### Polygon deploy
truffle deploy --network maticMainnet
