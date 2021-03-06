/**
 * User: llukac<lukas@lightstreams.io>
 * Date: 07/10/19 14:44
 * Copyright 2019 (c) Lightstreams, Granada
 */

const { BN, ether } = require('openzeppelin-test-helpers');

const { pht2wei, wei2pht } = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("ClaimTokensOverflow", ([artist, hatcher, buyer, feeRecipient]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;

  const DENOMINATOR_PPM = 1000000;
  const AMOUNT_TO_RAISE_PHT = 10000; // 10€
  const AMOUNT_TO_RAISE_WEI = pht2wei(AMOUNT_TO_RAISE_PHT);

  const RESERVE_RATIO = 142857; // kappa ~ 6
  const THETA = 350000; // 35% in ppm
  const P0 = 1000000; // price in ppm to purchase during hatching
  const FRICTION = 20000; // 2% in ppm
  const GAS_PRICE_WEI = 15000000000; // 15 gwei
  const HATCH_DURATION_SECONDS = 3024000; // 5 weeks
  const HATCH_VESTING_DURATION_SECONDS = 0; // 0 seconds

  const ARTIST_NAME = 'Armin Van Lightstreams';
  const ARTIST_SYMBOL = 'AVL';

  it('should deploy new ArtistToken', async () => {
    fundingPool = await FundingPool.new({ from: artist });
    wPHT = await WPHT.new();

    artistToken = await ArtistToken.new(
      artist,
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, feeRecipient, artist],
      [GAS_PRICE_WEI, THETA, P0, AMOUNT_TO_RAISE_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, AMOUNT_TO_RAISE_WEI],
      RESERVE_RATIO,
      { from: artist, gas: 10000000 }
    );

    artistTokenSymbol = await artistToken.symbol.call();
  });

  it("should hatch artist", async () => {
    await wPHT.deposit({
      from: hatcher,
      value: AMOUNT_TO_RAISE_WEI
    });

    await wPHT.approve(artistToken.address, AMOUNT_TO_RAISE_WEI, {from: hatcher});
    await artistToken.hatchContribute(AMOUNT_TO_RAISE_WEI, {from: hatcher});

    let isHatched = await artistToken.isHatched();

    assert.isTrue(isHatched);
  });

  it("should let artist to withdraw funds", async () => {
    const balance = await wPHT.balanceOf(fundingPool.address);
    await fundingPool.allocateFunds(artistToken.address, artist, balance, {from: artist });
  });

  it("should allow hatcher to claim a proportion of tokens", async () => {
    const artistBalance = await wPHT.balanceOf(artist);
    const expectedHatcherBalance = artistBalance.mul(new BN(P0)).div(new BN(DENOMINATOR_PPM));

    await artistToken.claimTokens({from: hatcher});

    const balance = await artistToken.balanceOf(hatcher);

    assert.equal(web3.utils.fromWei(balance), web3.utils.fromWei(expectedHatcherBalance));
  });

  // Should increase overall economy (paidExternal * unlockedInternal) / initialRaise
  it("should generate income for feeReipient and unlock hatcher funds", async () => {
    const buyerWei = pht2wei(AMOUNT_TO_RAISE_PHT * 100);

    await wPHT.deposit({ from: buyer, value: buyerWei});
    await wPHT.approve(artistToken.address, buyerWei, {from: buyer});
    await artistToken.mint(buyerWei, {from: buyer, gasPrice: GAS_PRICE_WEI});

    const balance = await artistToken.balanceOf(buyer);

    await artistToken.burn(balance, {from: buyer, gasPrice: GAS_PRICE_WEI});
  });

  it("should allow hatcher to claimed tokens", async () => {
    const contribution = await artistToken.initialContributions(hatcher);
    const lockedInternal = contribution.lockedInternal;
    const preBalance = await artistToken.balanceOf(hatcher);
    const expectedBalance = preBalance.add(lockedInternal);

    await artistToken.claimTokens({from: hatcher});

    const postBalance = await artistToken.balanceOf(hatcher);

    assert.equal(expectedBalance.toString(), postBalance.toString());
  });
});
