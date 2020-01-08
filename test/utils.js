require('dotenv').config({ path: `${process.env.PWD}/.env` });
const { BN } = require('openzeppelin-test-helpers');
const { ether } = require('openzeppelin-test-helpers');

module.exports.pht2wei = (value) => {
  return ether(value.toString());
};

module.exports.artist2wei = (value) => {
  let n = new BN(value.toString());
  //n = n.mul(new BN(10));
  return ether(n);
};

const wei2pht = (n) => {
  return web3.utils.fromWei(n, 'ether');
};

const wei2artist = (n) => {
  //n = n.div(new BN(10));
  return web3.utils.fromWei(n, 'ether');
};

module.exports.wei2pht = wei2pht;

module.exports.wei2artist = wei2artist;

module.exports.pht2euro = (photons) => {
  return parseFloat(photons * process.env.PHT_PRICE_EURO).toFixed(2);
};

module.exports.wei2euro = (photons) => {
  return parseFloat(wei2pht(photons) * process.env.PHT_PRICE_EURO).toFixed(2);
};

module.exports.pricePerArtistToken = (photons, artistTokens) => {
  return wei2pht(photons) / wei2artist(artistTokens)* process.env.PHT_PRICE_EURO;
};

module.exports.calcPercentageIncrease = (before, after) => {
  return ((after - before) / before) * 100.0;
};

module.exports.sleep = (seconds) => {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

module.exports.daysInMonth = (month, year) => {
    return new Date(year, month, 0).getDate();
}
