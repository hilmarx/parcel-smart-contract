const AllowanceModule = artifacts.require("AllowanceModule");
const Resolver = artifacts.require("Resolver");

//RINKEBY
const GELATO = "0x0630d1b8C2df3F0a68Df578D02075027a6397173";
const GELATO_POKE_ME = "0x8c089073A9594a4FB03Fa99feee3effF0e2Bc58a";

module.exports = function (deployer, network, accounts) {
  deployer.then(async () => {
    const allowanceModule = await deployer.deploy(
      AllowanceModule,
      GELATO,
      GELATO_POKE_ME,
      {
        from: accounts[0],
      }
    );

    await deployer.deploy(Resolver, allowanceModule.address, {
      from: accounts[0],
    });
  });
};
