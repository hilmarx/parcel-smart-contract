const utils = require('@gnosis.pm/safe-contracts/test/utils/general')

const truffleContract = require("@truffle/contract")

const GnosisSafeBuildInfo = require("@gnosis.pm/safe-contracts/build/contracts/GnosisSafe.json")
const GnosisSafe = truffleContract(GnosisSafeBuildInfo)
GnosisSafe.setProvider(web3.currentProvider)
const GnosisSafeProxyBuildInfo = require("@gnosis.pm/safe-contracts/build/contracts/GnosisSafeProxy.json")
const GnosisSafeProxy = truffleContract(GnosisSafeProxyBuildInfo)
GnosisSafeProxy.setProvider(web3.currentProvider)

const AllowanceModule = artifacts.require("./AllowanceModule.sol")
const TestToken = artifacts.require("./TestToken.sol")
const Resolver = artifacts.require("./Resolver.sol")

contract('Resolver test', function(accounts) {
    let lw
    let gnosisSafe
    let safeModule
    let resolver

    const CALL = 0
    const ADDRESS_0 = "0x0000000000000000000000000000000000000000"
    const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    const GELATO = "0x3CACa7b48D0573D793d3b0279b5F0029180E83b6"
    const GELATO_POKE_ME = "0xB3f5503f93d5Ef84b06993a1975B9D21B962892F"

    beforeEach(async function() {
        // Create lightwallet
        lw = await utils.createLightwallet()

        // Create Master Copies
        safeModule = await AllowanceModule.new(GELATO, GELATO_POKE_ME, {from: accounts[0]})

        resolver = await Resolver.new(safeModule.address, {from: accounts[0]})

        await safeModule.contract.methods.setResolverAddress(resolver.address).send({from: accounts[0]})
        let resolverAddress = await safeModule.RESOLVER()
        assert.equal(resolverAddress, resolver.address)

        const gnosisSafeMasterCopy = await GnosisSafe.new({ from: accounts[0] })
        const proxy = await GnosisSafeProxy.new(gnosisSafeMasterCopy.address, { from: accounts[0] })
        gnosisSafe = await GnosisSafe.at(proxy.address)
        await gnosisSafe.setup([lw.accounts[0], lw.accounts[1], accounts[1]], 2, ADDRESS_0, "0x", ADDRESS_0, ADDRESS_0, 0, ADDRESS_0, { from: accounts[0] })

        let enableModuleData = await gnosisSafe.contract.methods.enableModule(safeModule.address).encodeABI()
        await execTransaction(gnosisSafe.address, 0, enableModuleData, CALL, "enable module")
        let modules = await gnosisSafe.getModules()
        assert.equal(1, modules.length)
        assert.equal(safeModule.address, modules[0])
    })

    let execTransaction = async function(to, value, data, operation, message) {
        let nonce = await gnosisSafe.nonce()
        let transactionHash = await gnosisSafe.getTransactionHash(to, value, data, operation, 0, 0, 0, ADDRESS_0, ADDRESS_0, nonce)
        let sigs = utils.signTransaction(lw, [lw.accounts[0], lw.accounts[1]], transactionHash)
        utils.logGasUsage(
            'execTransaction ' + message,
            await gnosisSafe.execTransaction(to, value, data, operation, 0, 0, 0, ADDRESS_0, ADDRESS_0, sigs, { from: accounts[0] })
        )
    }

    it("Should create task", async () => {
        let setPaymenTokenData = await safeModule.contract.methods.setPaymentToken(ETH_ADDRESS).encodeABI()
        await execTransaction(safeModule.address, 0, setPaymenTokenData, CALL, "set payment token")
        
        const isEthPaymentToken = await safeModule.contract.methods.paymentTokens(gnosisSafe.address, ETH_ADDRESS).call()
        assert.equal(isEthPaymentToken, true)

        let createGelatoTaskData = await safeModule.contract.methods.createGelatoTask(ETH_ADDRESS, ETH_ADDRESS).encodeABI()
        await execTransaction(safeModule.address, 0, createGelatoTaskData, CALL, "create gelato task")
    })

    it('Resolver should return true when one or more delegate has allowance', async () => {
        const token = await TestToken.new({from: accounts[0]})
        await token.transfer(gnosisSafe.address, 1000, {from: accounts[0]}) 
        
        // Add delegates
        let addDelegateData = await safeModule.contract.methods.addDelegate(lw.accounts[4]).encodeABI()
        await execTransaction(safeModule.address, 0, addDelegateData, CALL, "add delegate 1")

        let addDelegateData2 = await safeModule.contract.methods.addDelegate(lw.accounts[5]).encodeABI()
        await execTransaction(safeModule.address, 0, addDelegateData2, CALL, "add delegate 2")

        let delegates = await safeModule.getDelegates(gnosisSafe.address, 0, 10)
        assert.equal(2, delegates.results.length)
        assert.equal(lw.accounts[5], delegates.results[0].toLowerCase())
        assert.equal(lw.accounts[4], delegates.results[1].toLowerCase())


        // Add allowance 
        let setAllowanceData = await safeModule.contract.methods.setAllowance(lw.accounts[4], token.address, 100, 0, 0).encodeABI()
        await execTransaction(safeModule.address, 0, setAllowanceData, CALL, "set allowance")
        
        let setAllowanceData2 = await safeModule.contract.methods.setAllowance(lw.accounts[5], token.address, 100, 0, 0).encodeABI()
        await execTransaction(safeModule.address, 0, setAllowanceData2, CALL, "set allowance")
        
        // Check resolver
        let checkerResult1 = await resolver.contract.methods.checker(gnosisSafe.address, token.address).call();
        assert.equal(checkerResult1.canExec, true)
        assert.notEqual(checkerResult1.execPayload, null)

        // Remove delegate
        let removeDelegateData = await safeModule.contract.methods.removeDelegate(lw.accounts[4], false).encodeABI()
        await execTransaction(safeModule.address, 0, removeDelegateData, CALL, "remove delegate")
        delegates = await safeModule.getDelegates(gnosisSafe.address, 0, 10)
        assert.equal(1, delegates.results.length)

        // Check resolver
        let checkerResult2 = await resolver.contract.methods.checker(gnosisSafe.address, token.address).call();
        assert.equal(checkerResult2.canExec, true)
        assert.notEqual(checkerResult2.execPayload, null)

        // Remove delegate
        let removeDelegateData2 = await safeModule.contract.methods.removeDelegate(lw.accounts[5], false).encodeABI()
        await execTransaction(safeModule.address, 0, removeDelegateData2, CALL, "remove delegate")
        delegates = await safeModule.getDelegates(gnosisSafe.address, 0, 10)
        assert.equal(0, delegates.results.length)
   
        // Check resolver
        let checkerResult3 = await resolver.contract.methods.checker(gnosisSafe.address, token.address).call();
        assert.equal(checkerResult3.canExec, false)
        assert.equal(checkerResult3.execPayload, null)

    })

})