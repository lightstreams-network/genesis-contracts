/**

 * User: Michael Smolenski
 * Date: 20/12/19 14:44
 * Copyright 2019 (c) Lightstreams
 */

require('dotenv').config({ path: `${process.env.PWD}/simulation/config/plot1.env` });
const fs = require('fs');

const { BN } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht, pht2euro, wei2euro, pricePerArtistToken, calcPercentageIncrease, daysInMonth, artist2wei, wei2artist} = require('../test/utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("PlotTestCurve", ([lsAcc, artist, artistAccountant, superHatcher, hatcherSimulator, buyer1, buyerSimulator, lastBuyer, feeRecipient]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;
  let totalSupply;
  let tokenWPHTBalance;
  let tokenPrice;

  const MONTHS = process.env.MONTHS;
  const HATCH_LIMIT_PHT = process.env.HATCH_PHT;
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);
  const PURCHASE_AMOUNT_PHT = process.env.PURCHASE_AMOUNT_PHT;
  const PURCHASE_AMOUNT_WEI = pht2wei(PURCHASE_AMOUNT_PHT);

  const DENOMINATOR_PPM = 1000000;
  const PHT_PRICE_EURO = process.env.PHT_PRICE_EURO;;
  // kappa ~ 6 -> 1/7 * 1000000 = 142857
  // kappa ~ 1.25 (5/4) -> 1/2.25 * 1000000 = 444444
  const RESERVE_RATIO = process.env.KAPPA;
  const THETA = process.env.THETA;
  const P0 =  process.env.P0;
  const FRICTION = "0";
  const GAS_PRICE_WEI = process.env.GAS_PRICE_WEI;
  const HATCH_DURATION_SECONDS = process.env.HATCH_DURATION_SECONDS;
  const HATCH_VESTING_DURATION_SECONDS = process.env.HATCH_VESTING_DURATION_SECONDS;

  const ARTIST_NAME = 'Lightstreams Van Economy';
  const ARTIST_SYMBOL = 'LVE';

  const ARTIST_FUNDING_POOL_WITHDRAW_RATIO = parseFloat(process.env.ARTIST_FUNDING_POOL_WITHDRAW_RATIO);

  const PRINT_MARKET_ACTIVITY = process.env.PRINT_MARKET_ACTIVITY === "true";

  const SALE_FEE_PERCENTAGE = (FRICTION / DENOMINATOR_PPM * 100);
  const MIN_HATCH_CONTRIBUTION_WEI = pht2wei(1);

  const FILE_NAME = process.env.FILE_NAME
  const writableStream = fs.createWriteStream(FILE_NAME);
  writableStream.write('Time, Buy_Sell, Value_External, Value_External_EUR, Value_Internal, Supply_Internal, Bonded_External, Bonded_External_EUR, Exchange_Rate, Price_EUR, External_Internal_Ratio\n');

  plot = async (month, bs, internalWei, externalWei) => {
    let totalSupplyInternal = await artistToken.totalSupply();
    let totalSupplyExternal = await wPHT.balanceOf(artistToken.address);   

    let purchaseExchange = wei2pht(externalWei) / wei2artist(internalWei);
    let externalInternalRatio = wei2pht(totalSupplyExternal) / wei2artist(totalSupplyInternal);

    writableStream.write(month.toString());
    writableStream.write(", ");
    writableStream.write(bs);
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(externalWei)).toString());
    writableStream.write(", ");
    writableStream.write(parseFloat(wei2pht(externalWei) * process.env.PHT_PRICE_EURO).toFixed(2));
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(internalWei)).toString());
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(totalSupplyInternal)).toString());
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(totalSupplyExternal)).toString());
    writableStream.write(", ");
    writableStream.write(parseFloat(wei2pht(totalSupplyExternal) * process.env.PHT_PRICE_EURO).toFixed(2));
    writableStream.write(", ");
    writableStream.write(parseFloat(purchaseExchange).toFixed(4));
    writableStream.write(", ");
    writableStream.write(parseFloat(purchaseExchange * process.env.PHT_PRICE_EURO).toFixed(4));
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

    await plot(0, "B", hatcher1_lockedInternal, hatcher1_paidExternal);

  });

  it('should let an Artist to allocate raised funds from the FundingPool', async () => {
    const wPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const withdrawAmountWei = wPHTBalance.mul(new BN(ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100)).div(new BN(100));

    await fundingPool.allocateFunds(artistToken.address, artistAccountant, withdrawAmountWei, { from: artist });

    console.log(`Artist withdrawn ${ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100}% of tokens, ${wei2pht(withdrawAmountWei)} WPHT, worth ${wei2euro(withdrawAmountWei)}€ from FundingPool to an external account`);

    const accountantWPHTBalance = await wPHT.balanceOf(artistAccountant);

    assert.equal(accountantWPHTBalance.toString(), withdrawAmountWei.toString());
  });

  hatcherClaim = async (month, hatcherSimulator) => {
    let contribution = await artistToken.initialContributions(hatcherSimulator);
    let lockedInternal = contribution.lockedInternal;

    await artistToken.claimTokens({from: hatcherSimulator}); 

    let sellAmount = await artistToken.balanceOf(hatcherSimulator);
    let curBalance = await wPHT.balanceOf(hatcherSimulator);

    await artistToken.burn(sellAmount, {from: hatcherSimulator, gasPrice: GAS_PRICE_WEI});

    let newBalance = await wPHT.balanceOf(hatcherSimulator);
    let revenue = newBalance.sub(curBalance);
    await plot(month, "S", sellAmount, revenue);
  }

  it('should simulate configured market activity from .env file and print economy state', async () => {
    let buyer = [];
    let buyAmount = PURCHASE_AMOUNT_PHT / 2;
    
    for (let month = 1; month <= MONTHS; month ++) {

      console.log(`Month: ${month}`);

      const curBalance = await artistToken.balanceOf(buyerSimulator);
      buyAmount = buyAmount * 2;
      pricePHT = pht2wei(buyAmount);
      
      await wPHT.deposit({ from: buyerSimulator, value: pricePHT });
      await wPHT.approve(artistToken.address, pricePHT, {from: buyerSimulator});
      await artistToken.mint(pricePHT, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);
      buyer[month] = purchasedAmount;

      await plot(month, "B", purchasedAmount, pricePHT);
    }

    let month = MONTHS;
    for (let index = MONTHS; index >= 1; index --) {
      month ++;

      console.log(`Month: ${month}`);

      //const artistTokens = await artistToken.balanceOf(buyerSimulator);
      let sellAmount = buyer[index];

      const curBalance = await wPHT.balanceOf(buyerSimulator);

      await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
        
      const newBalance = await wPHT.balanceOf(buyerSimulator);
      const revenue = newBalance.sub(curBalance);

      await plot(month, "S", sellAmount, revenue);
    }

    await hatcherClaim(MONTHS * 2 + 1, hatcherSimulator);

  }); 

  it('close stream', async () => {
    writableStream.end();
  });
});
