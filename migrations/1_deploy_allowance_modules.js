const AllowanceModule = artifacts.require("AllowanceModule");

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    await deployer.deploy(AllowanceModule, accounts[0]);
  })
};
