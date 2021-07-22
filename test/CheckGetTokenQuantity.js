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
        let ETH_Decimal = 18
        let ETH_Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // ETH token
        let ETH_Oracle = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' // ETH Chainlink Mainnet Oracle for ETH->USD
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(ETH_Oracle).call() 
        const fiatAmount = BigNumber.from(pricefeedDetails[0]).div(BigNumber.from(10).pow(BigNumber.from(pricefeedDetails[1]).sub(2)))
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(fiatAmount.toString(), ETH_Address, ETH_Oracle).call()
        
        console.log('tokenQuantityWithDecimal: ', 
            pricefeedDetails[0], pricefeedDetails[1], fiatAmount.toString(), tokenQuantityWithDecimal.toString())

        let tokenQuantityWithoutDecimal = BigNumber.from(tokenQuantityWithDecimal).div(BigNumber.from(10).pow(ETH_Decimal))
        console.log('ETH: ', pricefeedDetails[0], pricefeedDetails[1], tokenQuantityWithoutDecimal.toString(), 
            tokenQuantityWithDecimal.toString(), pricefeedDetails[0].toString(), fiatAmount.toString());
        assert.equal(99, tokenQuantityWithoutDecimal)
    })

    it('Get Token Quantity for MATIC', async () => {
        let MATIC_Decimal = 18
        let MATIC_Address = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0' // MATICETH token
        let MATIC_Oracle = '0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676' // MATICETH Chainlink Mainnet Oracle for MATICETH->USD
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(MATIC_Oracle).call() 
        const fiatAmount = BigNumber.from(pricefeedDetails[0]).div(BigNumber.from(10).pow(BigNumber.from(pricefeedDetails[1]).sub(2)))
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(fiatAmount.toString(), MATIC_Address, MATIC_Oracle).call()
        let tokenQuantityWithoutDecimal = BigNumber.from(tokenQuantityWithDecimal).div(BigNumber.from(10).pow(MATIC_Decimal))
        console.log('MATIC: ', pricefeedDetails[0], pricefeedDetails[1], tokenQuantityWithoutDecimal.toString(), 
            tokenQuantityWithDecimal.toString(), pricefeedDetails[0].toString(), fiatAmount.toString());
        assert.equal(99, tokenQuantityWithoutDecimal)
    })

    it('Get Token Quantity for UNI', async () => {
        let Uni_Decimal = 18
        let UNI_Address = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' // Uni token
        let UNI_Oracle = '0x553303d460EE0afB37EdFf9bE42922D8FF63220e' // Uni Chainlink Mainnet Oracle for UNI->USD
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(UNI_Oracle).call() 
        const fiatAmount = BigNumber.from(pricefeedDetails[0]).div(BigNumber.from(10).pow(BigNumber.from(pricefeedDetails[1]).sub(2)))
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(fiatAmount.toString(), UNI_Address, UNI_Oracle).call()
        let tokenQuantityWithoutDecimal = BigNumber.from(tokenQuantityWithDecimal).div(BigNumber.from(10).pow(Uni_Decimal))
        console.log('UNI: ', pricefeedDetails[0], pricefeedDetails[1], tokenQuantityWithoutDecimal.toString(), 
            tokenQuantityWithDecimal.toString(), fiatAmount.toString());
        assert.equal(99, tokenQuantityWithoutDecimal)
    })

    it('Get Token Quantity for ZRX', async () => {
        let ZRX_Decimal = 18
        let ZRX_Address = '0xe41d2489571d322189246dafa5ebde1f4699f498' // Uni token
        let ZRX_Oracle = '0x2885d15b8Af22648b98B122b22FDF4D2a56c6023' // ZRX Chainlink Mainnet Oracle for ZRX->USD
        let pricefeedDetails = await safeModule.contract.methods.getLatestPrice(ZRX_Oracle).call() 
        const fiatAmount = BigNumber.from(pricefeedDetails[0]).div(BigNumber.from(10).pow(BigNumber.from(pricefeedDetails[1]).sub(2)))
        let tokenQuantityWithDecimal = await safeModule.contract.methods.getTokenQuantity(fiatAmount.toString(), ZRX_Address, ZRX_Oracle).call()
        let tokenQuantityWithoutDecimal = BigNumber.from(tokenQuantityWithDecimal).div(BigNumber.from(10).pow(ZRX_Decimal))
        console.log('ZRX: ', pricefeedDetails[0], pricefeedDetails[1], tokenQuantityWithoutDecimal.toString(), 
            tokenQuantityWithDecimal.toString(), pricefeedDetails[0].toString(), fiatAmount.toString());
        assert.equal(99, tokenQuantityWithoutDecimal)
    })
})
