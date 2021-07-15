const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle');
const AllowanceModule = artifacts.require("AllowanceModule");
const FixidityLib = artifacts.require("FixidityLib");

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    await deployer.deploy(FixidityLib); 
    await deployer.link(FixidityLib, AllowanceModule);
    await deployer.deploy(AllowanceModule, accounts[0]);
    // await deployTruffleContract(web3, AllowanceModule);
  })
};
