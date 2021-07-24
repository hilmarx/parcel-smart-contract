const utils = require('@gnosis.pm/safe-contracts/test/utils/general')
const { wait, waitUntilBlock } = require('./utils')(web3);

const truffleContract = require("@truffle/contract")

const GnosisSafeBuildInfo = require("@gnosis.pm/safe-contracts/build/contracts/GnosisSafe.json")
const GnosisSafe = truffleContract(GnosisSafeBuildInfo)
GnosisSafe.setProvider(web3.currentProvider)
const GnosisSafeProxyBuildInfo = require("@gnosis.pm/safe-contracts/build/contracts/GnosisSafeProxy.json")
const GnosisSafeProxy = truffleContract(GnosisSafeProxyBuildInfo)
GnosisSafeProxy.setProvider(web3.currentProvider)

const AllowanceModule = artifacts.require("./AllowanceModule.sol")
const TestToken = artifacts.require("./TestToken.sol")
const IERC20 = artifacts.require('IERC20')

contract('Fiat and EndsOn', function(accounts) {
    
    let lw
    let gnosisSafe
    let safeModule

    let tokenAddress = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' // Uni token
    let UNI_WHALE = '0xB045FA6893B26807298E93377Cbb92d7f37B19eB' // Uni Rich Address
    let UNI_Oracle = '0x553303d460EE0afB37EdFf9bE42922D8FF63220e' // Uni Chainlink Mainnet Oracle for UNI->USD
    const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

    // let tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    // let DAI_WHALE = '0x16463c0fdB6BA9618909F5b120ea1581618C1b9E'

    const CALL = 0
    const ADDRESS_0 = "0x0000000000000000000000000000000000000000"

    beforeEach(async function() {
        // Create lightwallet
        lw = await utils.createLightwallet()

        // // Create Master Copies
        safeModule = await AllowanceModule.new(lw.accounts[0])

        const gnosisSafeMasterCopy = await GnosisSafe.new({ from: accounts[0] })
        const proxy = await GnosisSafeProxy.new(gnosisSafeMasterCopy.address, { from: accounts[0] })
        gnosisSafe = await GnosisSafe.at(proxy.address)
        await gnosisSafe.setup([lw.accounts[0], lw.accounts[1], accounts[1]], 2, ADDRESS_0, "0x", ADDRESS_0, ADDRESS_0, 0, ADDRESS_0, { from: accounts[0] })
        
    })

    let currentMinutes = function() {
        return Math.floor(Date.now() / (1000 * 60))
    }

    let calculateResetTime = function(baseTime, resetTime) {
        let cM = currentMinutes()
        return cM - (cM - baseTime) % resetTime
    }

    let execTransaction = async function(to, value, data, operation, message) {
        let nonce = await gnosisSafe.nonce()
        let transactionHash = await gnosisSafe.getTransactionHash(to, value, data, operation, 0, 0, 0, ADDRESS_0, ADDRESS_0, nonce)
        let sigs = utils.signTransaction(lw, [lw.accounts[0], lw.accounts[1]], transactionHash)
        utils.logGasUsage(
            'execTransaction ' + message,
            await gnosisSafe.execTransaction(to, value, data, operation, 0, 0, 0, ADDRESS_0, ADDRESS_0, sigs, { from: accounts[0] })
        )
    }

    it('Set allowance with fiat price', async () => {
        token = await IERC20.at(tokenAddress)
        await token.transfer(gnosisSafe.address, web3.utils.toWei("1000.0", 'ether'), {from: UNI_WHALE})

        let enableModuleData = await gnosisSafe.contract.methods.enableModule(safeModule.address).encodeABI()
        await execTransaction(gnosisSafe.address, 0, enableModuleData, CALL, "enable module")
        let modules = await gnosisSafe.getModules()
        assert.equal(1, modules.length)
        assert.equal(safeModule.address,  modules[0])

        await safeModule.contract.methods.addTokenOracle(
            tokenAddress, UNI_Oracle
        ).send({from: accounts[0]})

        const oracle = await safeModule.contract.methods.tokenToOracle(tokenAddress).call()
        console.log('oracle: ', oracle.toString())

        let addDelegateData = await safeModule.contract.methods.addDelegate(lw.accounts[4]).encodeABI()
        await execTransaction(safeModule.address, 0, addDelegateData, CALL, "add delegate")

        let delegates = await safeModule.getDelegates(gnosisSafe.address, 0, 10)
        assert.equal(1, delegates.results.length)
        assert.equal(lw.accounts[4], delegates.results[0].toLowerCase())

        let startTime = currentMinutes() - 30
        let setAllowanceData = await safeModule.contract.methods.setAllowance(lw.accounts[4], token.address, 0, 1600, 0, 0, 0).encodeABI()
        await execTransaction(safeModule.address, 0, setAllowanceData, CALL, "set allowance")
        let allowance = await safeModule.contract.methods.getTokenAllowance(gnosisSafe.address, lw.accounts[4], token.address).call()
        console.log('allowance[0]: ', allowance[0])
        assert.equal(1600, allowance[0])
        // let amtt = await safeModule.contract.methods.getTokenQuantity('16', tokenAddress, UNI_Oracle).call()
        // console.log('amtt: ', amtt[0], amtt.toString());
    })

    it('Execute ether allowance with endsOn. AFter 3 times recurring should stop.', async () => {

        await web3.eth.sendTransaction({from: accounts[0], to: gnosisSafe.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(gnosisSafe.address), web3.utils.toWei("1.0", 'ether'))

        let enableModuleData = await gnosisSafe.contract.methods.enableModule(safeModule.address).encodeABI()
        await execTransaction(gnosisSafe.address, 0, enableModuleData, CALL, "enable module")
        let modules = await gnosisSafe.getModules()
        assert.equal(1, modules.length)
        assert.equal(safeModule.address, modules[0])

        let addDelegateData = await safeModule.contract.methods.addDelegate(lw.accounts[4]).encodeABI()
        await execTransaction(safeModule.address, 0, addDelegateData, CALL, "add delegate")

        let delegates = await safeModule.getDelegates(gnosisSafe.address, 0, 10)
        assert.equal(1, delegates.results.length)
        assert.equal(lw.accounts[4], delegates.results[0].toLowerCase())

        let setAllowanceData = await safeModule.contract.methods.setAllowance(lw.accounts[4], ETH_ADDRESS, web3.utils.toWei("1.0", 'ether'), 0, 0, 0, 3).encodeABI()
        await execTransaction(safeModule.address, 0, setAllowanceData, CALL, "set allowance")

        let tokens = await safeModule.getTokens(gnosisSafe.address, lw.accounts[4])
        assert.equal(1, tokens.length)
        assert.equal(ETH_ADDRESS, tokens[0])
        let tokenAllowance = await safeModule.getTokenAllowance(gnosisSafe.address, lw.accounts[4], ETH_ADDRESS)
        assert.equal(web3.utils.toWei("1.0", 'ether'), tokenAllowance[0])
        assert.equal(0, tokenAllowance[1])
        assert.equal(0, tokenAllowance[2])
        // Reset time should be set to current on first init
        assert.notEqual(0, tokenAllowance[3])
        assert.equal(1, tokenAllowance[4])

        assert.equal(await web3.eth.getBalance(gnosisSafe.address), web3.utils.toWei("1.0", 'ether'))
        assert.equal(await web3.eth.getBalance(lw.accounts[0]), 0)

        let nonce = tokenAllowance[4]
        let transferHash = await safeModule.generateTransferHash(
            gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), nonce
        )
        let signature = utils.signTransaction(lw, [lw.accounts[4]], transferHash)
        utils.logGasUsage(
            'executeAllowanceTransfer',
            await safeModule.executeAllowanceTransfer(
                gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), 0, lw.accounts[4], signature
            )
        )

        tokenAllowance = await safeModule.getTokenAllowance(gnosisSafe.address, lw.accounts[4], ETH_ADDRESS)
        nonce = tokenAllowance[4]
        transferHash = await safeModule.generateTransferHash(
            gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), nonce
        )
        signature = utils.signTransaction(lw, [lw.accounts[4]], transferHash)
        utils.logGasUsage(
            'executeAllowanceTransfer',
            await safeModule.executeAllowanceTransfer(
                gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), 0, lw.accounts[4], signature
            )
        )

        tokenAllowance = await safeModule.getTokenAllowance(gnosisSafe.address, lw.accounts[4], ETH_ADDRESS)
        nonce = tokenAllowance[4]
        transferHash = await safeModule.generateTransferHash(
            gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), nonce
        )
        signature = utils.signTransaction(lw, [lw.accounts[4]], transferHash)
        utils.logGasUsage(
            'executeAllowanceTransfer',
            await safeModule.executeAllowanceTransfer(
                gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), 0, lw.accounts[4], signature
            )
        )

        await utils.assertRejects(
            safeModule.executeAllowanceTransfer(
                gnosisSafe.address, ETH_ADDRESS, lw.accounts[0], web3.utils.toWei("0.001", 'ether'), 0, lw.accounts[4], signature
            ),
            'executeAllowanceTransfer'
        )

        assert.equal(await web3.eth.getBalance(gnosisSafe.address), web3.utils.toWei("0.997", 'ether'))
        assert.equal(await web3.eth.getBalance(lw.accounts[0]), web3.utils.toWei("0.003", 'ether'))

    })
})
