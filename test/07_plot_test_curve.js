/**

 * User: Michael Smolenski
 * Date: 20/12/19 14:44
 * Copyright 2019 (c) Lightstreams
 */

const fs = require('fs');

const { BN } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht, pht2euro, wei2euro, pricePerArtistToken, calcPercentageIncrease, daysInMonth, artist2wei, wei2artist} = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("EconomySimulation", ([lsAcc, artist, artistAccountant, superHatcher, hatcherSimulator, buyer1, buyerSimulator, lastBuyer, feeRecipient]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;
  let totalSupply;
  let tokenWPHTBalance;
  let tokenPrice;

  const HATCH_LIMIT_PHT = "1000";
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);
  const PURCHASE_AMOUNT_PHT = "1000";
  const PURCHASE_AMOUNT_WEI = pht2wei(PURCHASE_AMOUNT_PHT);

  const DENOMINATOR_PPM = 1000000;
  const PHT_PRICE_EURO = "0.01";
  // kappa ~ 6 -> 1/7 * 1000000 = 142857
  // kappa ~ 1.25 (5/4) -> 1/2.25 * 1000000 = 444444
  const RESERVE_RATIO = "142857";
  const THETA = "500000";
  const P0 = "1000000";
  const FRICTION = "100000";
  const GAS_PRICE_WEI = "15000000000";
  const HATCH_DURATION_SECONDS = "3024000";
  const HATCH_VESTING_DURATION_SECONDS = "0";

  const ARTIST_NAME = 'Lightstreams Van Economy';
  const ARTIST_SYMBOL = 'LVE';

  const ARTIST_FUNDING_POOL_WITHDRAW_RATIO = parseFloat("1.0");

  const PRINT_MARKET_ACTIVITY = "false";

  const SALE_FEE_PERCENTAGE = (FRICTION / DENOMINATOR_PPM * 100);
  const MIN_HATCH_CONTRIBUTION_WEI = pht2wei(1);

  const writableStream = fs.createWriteStream("./07_plot_test_curve.csv");
  writableStream.write('Time, Amount_External, Amount_Internal, Supply_Internal, Supply_External, Purchase_Exchange_Rate, External_Internal_Ratio\n');

  plot = async (time, bs, externalWei, internalWei) => {
    let totalSupplyInternal = await artistToken.totalSupply();
    let totalSupplyExternal = await wPHT.balanceOf(artistToken.address);   

    let purchaseExchange = wei2pht(externalWei) / wei2artist(internalWei);
    let externalInternalRatio = wei2pht(totalSupplyExternal) / wei2artist(totalSupplyInternal);

    writableStream.write(time.toString());
    writableStream.write(", ");
    writableStream.write(bs);
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(externalWei)).toString());
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(internalWei)).toString());
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(totalSupplyInternal)).toString());
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(totalSupplyExternal)).toString());
    writableStream.write(", ");
    writableStream.write(parseFloat(purchaseExchange).toFixed(4));
    writableStream.write(", ");
    writableStream.write(parseFloat(externalInternalRatio).toFixed(4));
    writableStream.write("\n");
  };

  it('should print economy settings', async () => {

    console.log({
      phtPricePerEuro: PHT_PRICE_EURO,
      hatchLimitPHT: HATCH_LIMIT_PHT,
      hatchLimitEuro: pht2euro(HATCH_LIMIT_PHT) + "€",
      hatchDurationSeconds: HATCH_DURATION_SECONDS,
      hatchVestingDurationSeconds: HATCH_VESTING_DURATION_SECONDS,
      averageHatcherCapitalPHT: PURCHASE_AMOUNT_PHT,
      averageHatcherCapitalEuro: pht2euro(PURCHASE_AMOUNT_PHT) + "€",
      hatchPricePerToken: P0,
      fundingPoolHatchPercentage: (THETA / DENOMINATOR_PPM * 100) + "%",
      saleFeePercentage: SALE_FEE_PERCENTAGE + "%",
      artistName: ARTIST_NAME,
      artistSymbol: ARTIST_SYMBOL,
      artistFundingPoolWithdrawPercentage: (ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100) + "%",
    });
  });

  it('should deploy a new ArtistToken', async () => {
    fundingPool = await FundingPool.new({ from: artist });
    wPHT = await WPHT.new();

    artistToken = await ArtistToken.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, feeRecipient, lsAcc],
      [GAS_PRICE_WEI, THETA, P0, HATCH_LIMIT_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, MIN_HATCH_CONTRIBUTION_WEI],
      RESERVE_RATIO,
      { from: artist, gas: 10000000 }
    );

    artistTokenSymbol = await artistToken.symbol.call();
  });

  it('should end the hatching phase by contributing configured minimum amount to raise from hatchers', async () => {
    
    await wPHT.deposit({
      from: hatcherSimulator,
      value: HATCH_LIMIT_WEI
    });
    
    await wPHT.approve(artistToken.address, HATCH_LIMIT_WEI, {from: hatcherSimulator});
    await artistToken.hatchContribute(HATCH_LIMIT_WEI, {from: hatcherSimulator});

    let contribution = await artistToken.initialContributions(hatcherSimulator);
    let hatcher1_lockedInternal = contribution.lockedInternal;
    let hatcher1_paidExternal = contribution.paidExternal;

    let isHatched = await artistToken.isHatched();
    
    const totalContributions = HATCH_LIMIT_WEI;
  
    let totalSupplyInternal = await artistToken.totalSupply();
    let totalSupplyExternal = await wPHT.balanceOf(artistToken.address); 

    let purchaseExchange = wei2pht(hatcher1_paidExternal) / wei2artist(hatcher1_lockedInternal);
    let externalInternalRatio = wei2pht(totalSupplyExternal) / wei2artist(totalSupplyInternal);

    console.log("Economy after fully hatched:");
    console.log(` - total supply is ${wei2pht(totalSupplyInternal)} ${artistTokenSymbol}`);
    console.log(` - total size is ${wei2pht(totalSupplyExternal)} WPHT worth ${wei2euro(totalSupplyExternal)}€`);
    console.log(` - hatchers contributed ${wei2pht(totalContributions)} WPHT worth ${wei2euro(totalContributions)}€`);
    console.log(` - purchase exchange eate ${parseFloat(purchaseExchange).toFixed(4)} €`);
    console.log(` - external to internal ratio ${parseFloat(externalInternalRatio).toFixed(4)} €`);

    assert.isTrue(isHatched);

    await plot(0, "B", hatcher1_paidExternal, hatcher1_lockedInternal);

  });

  it('should let an Artist to allocate raised funds from the FundingPool', async () => {
    const wPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const withdrawAmountWei = wPHTBalance.mul(new BN(ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100)).div(new BN(100));

    await fundingPool.allocateFunds(artistToken.address, artistAccountant, withdrawAmountWei, { from: artist });

    console.log(`Artist withdrawn ${ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100}% of tokens, ${wei2pht(withdrawAmountWei)} WPHT, worth ${wei2euro(withdrawAmountWei)}€ from FundingPool to an external account`);

    const accountantWPHTBalance = await wPHT.balanceOf(artistAccountant);

    assert.equal(accountantWPHTBalance.toString(), withdrawAmountWei.toString());
  });

  hatcherClaim = async (time, hatcherSimulator) => {
    let contribution = await artistToken.initialContributions(hatcherSimulator);
    let lockedInternal = contribution.lockedInternal;

    await artistToken.claimTokens({from: hatcherSimulator}); 

    let sellAmount = await artistToken.balanceOf(hatcherSimulator);
    let curBalance = await wPHT.balanceOf(hatcherSimulator);

    await artistToken.burn(sellAmount, {from: hatcherSimulator, gasPrice: GAS_PRICE_WEI});

    let newBalance = await wPHT.balanceOf(hatcherSimulator);
    let revenue = newBalance.sub(curBalance);
    await plot(time, "S", revenue, sellAmount);
  }

  it('should simulate configured market activity from .env file and print economy state', async () => {
    let buyer = [];

    let months = 12;
    
    for (time = 1; time <= months; time ++) {

      console.log(`Month: ${time}`);

      const curBalance = await artistToken.balanceOf(buyerSimulator);
      pricePHT = pht2wei(PURCHASE_AMOUNT_PHT);
      
      await wPHT.deposit({ from: buyerSimulator, value: pricePHT });
      await wPHT.approve(artistToken.address, pricePHT, {from: buyerSimulator});
      await artistToken.mint(pricePHT, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);
      buyer[time] = purchasedAmount;

      await plot(time, "B", pricePHT, purchasedAmount);
    }

    for (time = months; time >= 1; time --) {

      console.log(`Month: ${time}`);

      const artistTokens = await artistToken.balanceOf(buyerSimulator);
      let sellAmount = buyer[time];

      const curBalance = await wPHT.balanceOf(buyerSimulator);

      await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
        
      const newBalance = await wPHT.balanceOf(buyerSimulator);
      const revenue = newBalance.sub(curBalance);

      await plot(time, "S", revenue, sellAmount);
    }

    await hatcherClaim(0, hatcherSimulator);

  }); 

  it('close stream', async () => {
    writableStream.end();
  });
});
