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
const {BigNumber} = require('@ethersproject/bignumber')

contract('Check Get Token Quantity', function(accounts) {
    
    let lw
    let safeModule

    beforeEach(async function() {
        lw = await utils.createLightwallet()
        safeModule = await AllowanceModule.new(lw.accounts[0])   
    })

    it('Get Token Quantity for ETH', async () => {
        // Price for almost 99.90 eth
        let ETH_Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' // ETH token
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(ETH_Address).call() 
        let diffDecimal = 18 - pricefeedDetails[1]
        let tokenQuantityWithDecimal = await safeModule.contract.methods
            .getTokenQuantity(
                BigNumber.from(pricefeedDetails[0]).mul(BigNumber.from(10).pow(diffDecimal)).toString(),
                ETH_Address
            ).call()
        assert.equal(1e18, tokenQuantityWithDecimal)
})

    it('Get Token Quantity for MATIC', async () => {
        let MATIC_Address = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0' // MATICETH token
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(MATIC_Address).call() 
        let diffDecimal = 18 - pricefeedDetails[1]
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(
            BigNumber.from(pricefeedDetails[0]).mul(BigNumber.from(10).pow(diffDecimal)).toString(),
            MATIC_Address
        ).call()
        assert.equal(1e18, tokenQuantityWithDecimal)
    })

    it('Get Token Quantity for UNI', async () => {
        let UNI_Address = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' // Uni token
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(UNI_Address).call()         
        let diffDecimal = 18 - pricefeedDetails[1]        
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(
            BigNumber.from(pricefeedDetails[0]).mul(BigNumber.from(10).pow(diffDecimal)).toString(),
            UNI_Address
        ).call()
        assert.equal(1e18, tokenQuantityWithDecimal.toString())
    })

    it('Get Token Quantity for ZRX', async () => {
        let ZRX_Address = '0xe41d2489571d322189246dafa5ebde1f4699f498' // ZRX token
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(ZRX_Address).call() 
        let diffDecimal = 18 - pricefeedDetails[1]        
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(
            BigNumber.from(pricefeedDetails[0]).mul(BigNumber.from(10).pow(diffDecimal)).toString(), 
            ZRX_Address
        ).call()
        assert.equal(1e18, tokenQuantityWithDecimal.toString())
    })
})
