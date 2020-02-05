require("dotenv").config();

const PrivateKeyProvider = require("truffle-privatekey-provider");
const HDWalletProvider = require("truffle-hdwallet-provider");
const mnemonic =
  "hope awesome inherit detect employ busy popular clip olive fork better glare";

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      //gas: 10000000,

      gasPrice: 1000000000
    },
    standalone: {
        host: "127.0.0.1",
        port: 8545,
        network_id: "161",
        gasPrice: "500000000000",
        from: "0xc916cfe5c83dd4fc3c3b0bf2ec2d4e401782875e"
    },
    test: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    },
    rinkeby: {
      provider: () =>
      new PrivateKeyProvider(
        process.env.RINKEBY_KEY,
        `https://rinkeby.infura.io/${process.env.INFURA_KEY}`
      ),
      network_id: 15
    }
  },
  compilers: {
    solc: {
      parser: "solcjs", 
      //version: '0.5.16', // Commented beacuse it is causing VM Exception while processing transaction: out of gas exception. 
                          // I referred to this to figure out the issue: https://github.com/trufflesuite/truffle/issues/1308
      optimizer: {
        enabled: true, // Default: false
        runs: 5000     // Default: 200
      }
    }
  }
};
