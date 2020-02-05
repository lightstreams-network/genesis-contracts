/**
 * User: msmolenski<michael@lightstreams.io>
 * Date: 19/01/20
 * Copyright 2019 (c) Lightstreams
 */

const { BN, shouldFail } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht } = require('./utils');

const WPHTPromotion = artifacts.require("WPHTPromotion.sol");
const FundingPool = artifacts.require("FundingPool.sol"); 
const ArtistToken = artifacts.require("ArtistToken.sol");
const Dummy = artifacts.require("Dummy.sol");
const Foo = artifacts.require("Foo.sol");
const Bar = artifacts.require("Bar.sol");
const BarWPHTPromotion = artifacts.require("BarWPHTPromotion.sol");
const FooArtist = artifacts.require("FooArtist.sol");
const ArtistTokenFix = artifacts.require("ArtistTokenFix.sol");


contract("Promotion Tokens", ([project, artist, hatcher]) => {
  const ARTIST_NAME = 'Armin Van Lightstreams';
  const ARTIST_SYMBOL = 'AVL';
  const DENOMINATOR_PPM = 1000000;
  const AMOUNT_TO_RAISE_PHT = 10000; // 100€
  const AMOUNT_TO_RAISE_WEI = pht2wei(AMOUNT_TO_RAISE_PHT);
  const RESERVE_RATIO = 142857; // kappa ~ 6
  const THETA = 350000; // 35% in ppm
  const P0 = 1000000; // price in ppm to purchase during hatching
  const FRICTION = 100000; // 10% in ppm
  const GAS_PRICE_WEI = 15000000000; // 15 gwei
  const HATCH_DURATION_SECONDS = 3024000; // 5 weeks
  const HATCH_VESTING_DURATION_SECONDS = 0; // 0 seconds

  let fundingPool;
  let wPHT;
  
  it('should deploy new PromotionToken', async () => {
    fundingPool = await FundingPool.new({ from: artist });
    wPHT = await WPHTPromotion.new({ from: artist });

    artistToken = await ArtistToken.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, fundingPool.address, project],
      [GAS_PRICE_WEI, THETA, P0, AMOUNT_TO_RAISE_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, AMOUNT_TO_RAISE_WEI],
      RESERVE_RATIO,
      { from: artist, gas: 10000000 }
    );
    
    await wPHT.addPromotionSpending(artist); 

    await wPHT.deposit({
      from: project,
      value: AMOUNT_TO_RAISE_WEI
    });

    const perHatcherPromoBal = await wPHT.promoBalanceOf(hatcher);
    console.log(`hatcher promotion balance before: ${perHatcherPromoBal}`);

    await wPHT.transferAsPromotion(hatcher, AMOUNT_TO_RAISE_WEI, {from: project});
    //await wPHT.transfer(hatcher, AMOUNT_TO_RAISE_WEI, {from: project});
    const balance = await wPHT.balanceOf(hatcher);

    const postHatcherPromoBal = await wPHT.promoBalanceOf(hatcher);
    console.log(`hatcher promotion balance after: ${postHatcherPromoBal}`);

    console.log(`hatcher balance after: ${balance}`);

    const balanceBefore = await wPHT.balanceOf(artist);
    console.log(`artist balance before: ${balanceBefore}`);

    await wPHT.approvePromotionTokens(artist, AMOUNT_TO_RAISE_WEI, {from: hatcher});
    //await wPHT.approve(artist, AMOUNT_TO_RAISE_WEI, {from: hatcher});

    await wPHT.transferFrom(hatcher, artist, AMOUNT_TO_RAISE_WEI, {from: artist});

    const balanceAfter = await wPHT.balanceOf(artist);
    console.log(`artist balance after: ${balanceAfter}`);

    const postHatcherPromoBal2 = await wPHT.promoBalanceOf(hatcher);
    console.log(`hatcher promotion balance after: ${postHatcherPromoBal2}`);

    const value = await wPHT.pullPromotionTokens(hatcher, AMOUNT_TO_RAISE_WEI, {from: artist});

    const postArtistPromoBal = await wPHT.promoBalanceOf(artist);
    console.log(`artist promotion balance after: ${postArtistPromoBal}`);
  });

  /*
  it('should hatch with promotion tokens', async () => {
    await wPHT.deposit({
      from: hatcher,
      value: AMOUNT_TO_RAISE_WEI
    });

    await wPHT.approve(artistToken.address, AMOUNT_TO_RAISE_WEI, {from: hatcher});
    await artistToken.hatchContribute(AMOUNT_TO_RAISE_WEI, {from: hatcher});

    let isHatched = await artistToken.isHatched();

    assert.isTrue(isHatched);

    const bal = await artistToken.promoBalanceOf(hatcher);
    console.log(`promo: ${bal}`);
  }); */

  it('should hatch with promotion tokens', async () => {
    await wPHT.addPromotionSpending(artistToken.address); 

    await wPHT.deposit({
      from: project,
      value: AMOUNT_TO_RAISE_WEI
    });

    await wPHT.transferAsPromotion(hatcher, AMOUNT_TO_RAISE_WEI, {from: project});
    await wPHT.approvePromotionTokens(artistToken.address, AMOUNT_TO_RAISE_WEI, {from: hatcher});

    await artistToken.hatchContribute(AMOUNT_TO_RAISE_WEI, {from: hatcher});

    let isHatched = await artistToken.isHatched();

    assert.isTrue(isHatched);

    const bal = await artistToken.promoBalanceOf(hatcher);
    console.log(`bal: ${bal}`);
  });
  
  it('should foobar', async () => {
    let foo = await Foo.new({ from: project });
    let bar = await Bar.new({ from: project });
    let barPromo = await BarWPHTPromotion.new({ from: project });

    await foo.depositValue(bar.address, AMOUNT_TO_RAISE_WEI, {from: project});
    await foo.deposit(bar.address, {from: project, value: AMOUNT_TO_RAISE_WEI});
    await foo.approve(barPromo.address, project, AMOUNT_TO_RAISE_WEI, {from: project});

    const bal = await bar.balanceOf(foo.address);

    console.log(`bal: ${bal}`);

  });

  it('should foobar Artist', async () => {
    let bar = await Bar.new({ from: project });
    let barPromo = await BarWPHTPromotion.new({ from: project });

    fundingPool = await FundingPool.new({ from: artist });
    wPHT = await WPHTPromotion.new({ from: artist });

    artistToken = await ArtistToken.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, fundingPool.address, project],
      [GAS_PRICE_WEI, THETA, P0, AMOUNT_TO_RAISE_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, AMOUNT_TO_RAISE_WEI],
      RESERVE_RATIO,
      { from: artist, gas: 10000000 }
    );

    foo = await FooArtist.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, fundingPool.address, project],
      [GAS_PRICE_WEI, THETA, P0, AMOUNT_TO_RAISE_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, AMOUNT_TO_RAISE_WEI],
      RESERVE_RATIO,
      { from: artist, gas: 100000000000 }
    );

    fooFix = await ArtistTokenFix.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, fundingPool.address, project],
      [GAS_PRICE_WEI, THETA, P0, AMOUNT_TO_RAISE_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, AMOUNT_TO_RAISE_WEI],
      RESERVE_RATIO,
      { from: artist, gas: 1000000000 }
    );

    //await foo.depositValue(bar.address, AMOUNT_TO_RAISE_WEI, {from: project});
    //await foo.deposit(bar.address, {from: project, value: AMOUNT_TO_RAISE_WEI});
    await foo.approveBar(barPromo.address, project, AMOUNT_TO_RAISE_WEI, {from: project});
    //await artistToken.approveBar(barPromo.address, project, AMOUNT_TO_RAISE_WEI, {from: project});

    const bal = await bar.balanceOf(foo.address);

    console.log(`bal: ${bal}`);

  });

});
