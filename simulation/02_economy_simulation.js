/**

 * User: Michael Smolenski
 * Date: 20/12/19 14:44
 * Copyright 2019 (c) Lightstreams
 */

const fs = require('fs');

const { BN } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht, pht2euro, wei2euro, pricePerArtistToken, calcPercentageIncrease, daysInMonth, artist2wei, wei2artist} = require('../test/utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

const { generateFans } = require('../test/generateFans');

contract("EconomySimulation", ([lsAcc, artist, artistAccountant, superHatcher, hatcherSimulator, buyer1, buyerSimulator, lastBuyer, feeRecipient]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;
  let totalSupplyInternal;
  let totalSupplyExternal;
  let tokenPrice;
  let day = 0;
  let month = 0;
  let prevDay = -1;
  let prevMonth = -1;
  let subscribers = 0;
  let speculators = 0;

  const SIMULATION_MONTHS = 18;
  const INIT_SUBSCRIBERS = 20;
  const INIT_SPECULATORS = 1;
  const SUBSCRIBER_GROWTH = 0.30;
  const SPECULATOR_GROWTH = 0.20;
  const YEAR = 2020;

  // 1000 €
  const HATCH_LIMIT_PHT = "250000";
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);
  const SUBSCRIPTION_PRICE = artist2wei(50);
  const MIN_FAN_BALANCE = artist2wei(30);
  // 200 €
  const SUPER_HATCHER_CAPITAL_PHT = "20000";
  const SUPER_HATCHER_CAPITAL_WEI = pht2wei(SUPER_HATCHER_CAPITAL_PHT);
  // 50 €
  const AVERAGE_HATCHER_CAPITAL_PHT = "5000";
  const AVERAGE_HATCHER_CAPITAL_WEI = pht2wei(AVERAGE_HATCHER_CAPITAL_PHT);
  const HATCHER_SIMULATOR_DEPOSIT_WEI = HATCH_LIMIT_WEI;  
  const TOTAL_HATCHERS = ((HATCH_LIMIT_PHT - SUPER_HATCHER_CAPITAL_PHT) / AVERAGE_HATCHER_CAPITAL_PHT) + 1;
  const SUPER_HATCHERS = 1;
  const AVERAGE_HATCHERS = TOTAL_HATCHERS - SUPER_HATCHERS;

  const DENOMINATOR_PPM = 1000000;
  // kappa ~ 6 -> 1/7 * 1000000 = 142857
  // kappa ~ 3 -> 1/4 * 1000000 = 254444
  // kappa ~ 2 -> 1/3 * 1000000 = 333333
  // kappa ~ 1.25 (5/4) -> 1/2.25 * 1000000 = 444444
  const RESERVE_RATIO="333333";
  // 40%
  const THETA = "400000";
  // 1.00
  const P0 =  "600000";
  // 10%
  const FRICTION = "100000";
  const GAS_PRICE_WEI = "15000000000";
  const HATCH_DURATION_SECONDS = "3024000";
  const HATCH_VESTING_DURATION_SECONDS = "0";

  const ARTIST_NAME = 'Lightstreams Van Economy';
  const ARTIST_SYMBOL = 'LVE';

  const BUYERS = parseInt("30");
  const BUYER_CAPITAL_PHT = "2000";
  const BUYER_CAPITAL_WEI = pht2wei(BUYER_CAPITAL_PHT);

  const SELLER_RATIO = parseFloat("0.6");
  const SELLER_AMOUNT_RATIO = parseFloat("0.80");
  const SELLERS = Math.round(BUYERS * SELLER_RATIO);

  const ARTIST_FUNDING_POOL_WITHDRAW_RATIO = parseFloat("1.0");
  const HATCHER_SELL_RATIO = parseFloat("0.5");

  const PRINT_MARKET_ACTIVITY = false;

  const SALE_FEE_PERCENTAGE = (FRICTION / DENOMINATOR_PPM * 100);
  const MIN_HATCH_CONTRIBUTION_WEI = pht2wei(1);

  let subscriptionPriceWei = artist2wei(5);

  let fans = generateFans(YEAR, INIT_SUBSCRIBERS, INIT_SPECULATORS, SUBSCRIBER_GROWTH, SPECULATOR_GROWTH);

  if (PRINT_MARKET_ACTIVITY) {
    for (let subscriberIndex = 0; subscriberIndex < fans.length; subscriberIndex++) {
      console.log(`Index: ${subscriberIndex}, buyDay: ${fans[subscriberIndex].buyDay}, month: ${fans[subscriberIndex].month}, sellMonth: ${fans[subscriberIndex].sellMonth}`);
    }
  }

  const streamPlot = fs.createWriteStream("./simulation/output/02_economy_simulation.csv");
  streamPlot.write('Month, Day, Fan_ID, Fan_Type, Buy_Sell, Value_External, Value_External_EUR, Value_Internal, Supply_Internal, Bonded_External, Bonded_External_EUR, Exchange_Rate, Price_EUR, External_Internal_Ratio, Project_Balance_EUR, Artist_Balance_EUR, Locked_Internal, Speculators, Subscribers\n');

  const streamMonthOHLC = fs.createWriteStream("./simulation/output/02_economy_simulation_month_ohlc.csv");
  streamMonthOHLC.write('Month, Open, Close, High, Low, Vol, Artist_Revenue_EUR, Project_Revenue_EUR\n');

  const streamDayOHLC = fs.createWriteStream("./simulation/output/02_economy_simulation_day_ohlc.csv");
  streamDayOHLC.write('Day, Open, Close, High, Low, Vol\n');

  let dayOpen = 0;
  let dayClose = 0;
  let dayHigh = 0;
  let dayLow = 0;
  let dayVol = 0;

  let monthOpen = 0;
  let monthClose = 0;
  let monthHigh = 0;
  let monthLow = 0;
  let monthVol = 0;

  let raiseInternal = 0;
  let artistBal = new BN(0);
  let artistRevenueMonth = new BN(0);
  let projectBal = new BN(0);
  let projectRevenueMonth = new BN(0);

  plotOHLV = async (stream, time, open, close, high, low, vol) => {
    stream.write(time.toString());
    stream.write(", ");
    stream.write(open.toString());
    stream.write(", ");
    stream.write(close.toString());
    stream.write(", ");
    stream.write(high.toString());
    stream.write(", ");
    stream.write(low.toString());
    stream.write(", ");
    stream.write(vol.toString());
    stream.write("\n");
  }

  plotMonth = async (stream, time, open, close, high, low, vol) => {
    stream.write(time.toString());
    stream.write(", ");
    stream.write(open.toString());
    stream.write(", ");
    stream.write(close.toString());
    stream.write(", ");
    stream.write(high.toString());
    stream.write(", ");
    stream.write(low.toString());
    stream.write(", ");
    stream.write(vol.toString());
    stream.write(", ");
    stream.write(wei2euro(artistRevenueMonth).toString());
    stream.write(", ");
    stream.write(wei2euro(projectRevenueMonth).toString());
    stream.write("\n");
  }

  plot = async (fan, fanType, bs, internalWei, externalWei) => {
    totalSupplyInternal = await artistToken.totalSupply();
    totalSupplyExternal = await wPHT.balanceOf(artistToken.address);  

    let purchaseExchange = wei2pht(externalWei) / wei2artist(internalWei);
    let externalInternalRatio = wei2pht(totalSupplyExternal) / wei2artist(totalSupplyInternal);
    tokenPrice = pricePerArtistToken(externalWei, internalWei);
    tokenPrice = parseFloat(tokenPrice).toFixed(4);

    const feeBalance = await wPHT.balanceOf(feeRecipient);
    const hatcherBalance = await wPHT.balanceOf(hatcherSimulator);
    let projectBalance = feeBalance.add(hatcherBalance);

/*
    if (totalSupplyInternal.gt(pht2wei(new BN("200000")))) {
      subscriptionPriceWei = artist2wei(15);
    }*/

    const unlockedInternal = await artistToken.unlockedInternal();
    const lockedInteral = raiseInternal.sub(unlockedInternal);

    let vol = Math.round(wei2pht(totalSupplyInternal));
    dayVol += vol;
    monthVol += vol;

    streamPlot.write(month.toString());
    streamPlot.write(", ");
    streamPlot.write(day.toString());
    streamPlot.write(", ");

    let fan_id = 0;
    if (fan) {
      fan_id = fan.id;
    }
    streamPlot.write(fan_id.toString());
    streamPlot.write(", ");
    streamPlot.write(fanType);
    streamPlot.write(", ");
    streamPlot.write(bs);
    streamPlot.write(", ");
    streamPlot.write(Math.round(wei2pht(externalWei)).toString());
    streamPlot.write(", ");
    streamPlot.write(wei2euro(externalWei));
    streamPlot.write(", ");
    streamPlot.write(Math.round(wei2artist(internalWei)).toString());
    streamPlot.write(", ");
    streamPlot.write(vol.toString());
    streamPlot.write(", ");
    streamPlot.write(Math.round(wei2pht(totalSupplyExternal)).toString());
    streamPlot.write(", ");
    streamPlot.write(wei2euro(totalSupplyExternal).toString());
    streamPlot.write(", ");
    streamPlot.write(parseFloat(purchaseExchange).toFixed(4));
    streamPlot.write(", ");
    streamPlot.write(tokenPrice.toString());
    streamPlot.write(", ");
    streamPlot.write(parseFloat(externalInternalRatio).toFixed(4));
    streamPlot.write(", ");
    streamPlot.write(wei2euro(feeBalance).toString());
    streamPlot.write(", ");
    streamPlot.write(wei2euro(artistBal).toString());
    streamPlot.write(", ");
    streamPlot.write(Math.round(wei2pht(lockedInteral)).toString());
    streamPlot.write(", ");
    streamPlot.write(speculators.toString());
    streamPlot.write(", ");
    streamPlot.write(subscribers.toString());

    streamPlot.write("\n");
  };

  generateTopUpAmount = () => {
    let rand = Math.floor(Math.random() * 100);
    if (rand < 50) {
      return 500;
    }
    if (rand < 80) {
      return 1000;
    }

    return 2000;
  }

  hatcherSell = async (hatcher, percentage) => {

    const artistTokenTotalSupply = await artistToken.totalSupply();

    const contribution = await artistToken.initialContributions(hatcher);
    const lockedInternal = contribution.lockedInternal;
    if (lockedInternal <= 0) {
      console.log(`hatcher cannot claim anymore tokens`);
      return;
    }

    await artistToken.claimTokens({from: hatcher});

    let balance = await artistToken.balanceOf(hatcher);

    const curBalance = await wPHT.balanceOf(hatcher);
    const projectCurrentBalance = await wPHT.balanceOf(feeRecipient);

    //const sellAmount = balance.mul(new BN(percentage)).div(new BN(100));
    const sellAmount = balance;
    await artistToken.burn(sellAmount, {from: hatcher, gasPrice: GAS_PRICE_WEI});
    
    const newBalance = await wPHT.balanceOf(hatcher);
    projectBal = await wPHT.balanceOf(feeRecipient);

    const revenue = newBalance.sub(curBalance);
    const projectRevenue = projectBal.sub(projectCurrentBalance);

    projectRevenueMonth = projectRevenueMonth.add(projectRevenue);

    console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
    plot(null, "HTC", "S", sellAmount, revenue);
  }

  simulateSubscriber = async (fan) => {
    let curBalance = await artistToken.balanceOf(buyerSimulator);

    if (!fan.tokens || fan.tokens.sub(subscriptionPriceWei).lt(MIN_FAN_BALANCE)) {

      let topUpAmount = generateTopUpAmount();
      topUpAmount = pht2wei(topUpAmount);
      
      await wPHT.deposit({ from: buyerSimulator, value: topUpAmount });
      await wPHT.approve(artistToken.address, topUpAmount, {from: buyerSimulator});
      await artistToken.mint(topUpAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);

      fan.tokens = fan.tokens.add(purchasedAmount);

      if (PRINT_MARKET_ACTIVITY) {
        console.log(` purchased ${wei2artist(purchasedAmount)} ${artistTokenSymbol} for ${wei2pht(topUpAmount)} WPHT worth ${wei2euro(topUpAmount)}€`);
      }

      plot(fan, "SUB", "B", purchasedAmount, topUpAmount);
    }

    curBalance = await wPHT.balanceOf(buyerSimulator);

    let projectCurrentBalance = await wPHT.balanceOf(feeRecipient);

    sellAmount = subscriptionPriceWei;
    await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
    
    let newBalance = await wPHT.balanceOf(buyerSimulator);
    projectBal = await wPHT.balanceOf(feeRecipient);

    let revenue = newBalance.sub(curBalance);
    let projectRevenue = projectBal.sub(projectCurrentBalance);

    fan.tokens = fan.tokens.sub(sellAmount);

    artistBal = artistBal.add(revenue);

    artistRevenueMonth = artistRevenueMonth.add(revenue);
    projectRevenueMonth = projectRevenueMonth.add(projectRevenue);
    
    plot(fan, "AST", "S", sellAmount, revenue);

    if (wei2pht(revenue) > 500) {
      /*
      subscriptionPriceWei = await artistToken.calculateCurvedMintReturn(pht2wei(200));
      console.log(`subscriptionPrice: ${wei2pht(subscriptionPriceWei)}`);

      subscriptionPriceWei = subscriptionPriceWei.mul(new BN(P0)).div(new BN(DENOMINATOR_PPM));
      console.log(`subscriptionPrice 2: ${wei2pht(subscriptionPriceWei)}`);
      */
      subscriptionPriceWei = subscriptionPriceWei.div(new BN("2"));

    }

    if (PRINT_MARKET_ACTIVITY) {
      console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
    }
  };

  specBuyAmount = () => {
    let rand = Math.floor(Math.random() * 100);
    if (rand < 50) {
      return 5000;
    }
    if (rand < 85) {
      return 10000;
    }

    if (rand < 95) {
      return 20000;
    }

    return 50000;
  }

  specSellAmount = (speculator) => {
    let tokens = speculator.tokens;
    let rand = Math.floor(Math.random() * 100);
    if (rand < 50) {
      return tokens.mul(new BN("30")).div(new BN("100"));
    }
    if (rand < 80) {
      return tokens.mul(new BN("50")).div(new BN("100"));
    }

    return tokens;
  }

  simulateSpeculator = async (fan) => {
    

    if (fan.month === month) {
      let topUpAmount = 20000;
      topUpAmount = pht2wei(topUpAmount);

      let curBalance = await artistToken.balanceOf(buyerSimulator);
      
      await wPHT.deposit({ from: buyerSimulator, value: topUpAmount });
      await wPHT.approve(artistToken.address, topUpAmount, {from: buyerSimulator});
      await artistToken.mint(topUpAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);
      fan.tokens = purchasedAmount;

      if (PRINT_MARKET_ACTIVITY) {
        console.log(` purchased ${wei2artist(purchasedAmount)} ${artistTokenSymbol} for ${wei2pht(topUpAmount)} WPHT worth ${wei2euro(topUpAmount)}€`);
      }

      plot(fan, "SPC", "B", purchasedAmount, topUpAmount);
    }

    if (fan.sellMonth === month) {
      if (fan.tokens ) {
        let curBalance = await wPHT.balanceOf(buyerSimulator);

        const projectCurrentBalance = await wPHT.balanceOf(feeRecipient);

        let sellAmount = specSellAmount(fan);

        await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
        
        const newBalance = await wPHT.balanceOf(buyerSimulator);
        projectBal = await wPHT.balanceOf(feeRecipient);

        const revenue = newBalance.sub(curBalance);
        const projectRevenue = projectBal.sub(projectCurrentBalance);

        projectRevenueMonth = projectRevenueMonth.add(projectRevenue);

        fan.tokens = fan.tokens.sub(sellAmount);

        plot(fan, "SPC", "S", sellAmount, revenue);

        if (PRINT_MARKET_ACTIVITY) {
          console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
        }
      }
      
    }
  };

  it('should print economy settings', async () => {

    console.log({
      hatchLimitPHT: HATCH_LIMIT_PHT,
      hatchLimitEuro: pht2euro(HATCH_LIMIT_PHT) + "€",
      hatchDurationSeconds: HATCH_DURATION_SECONDS,
      hatchVestingDurationSeconds: HATCH_VESTING_DURATION_SECONDS,
      superHatcherCapitalPHT: SUPER_HATCHER_CAPITAL_PHT,
      superHatcherCapitalEuro: pht2euro(SUPER_HATCHER_CAPITAL_PHT) + "€",
      averageHatcherCapitalPHT: AVERAGE_HATCHER_CAPITAL_PHT,
      averageHatcherCapitalEuro: pht2euro(AVERAGE_HATCHER_CAPITAL_PHT) + "€",
      superHatchers: SUPER_HATCHERS,
      averageHatchers: AVERAGE_HATCHERS,
      totalHatchers: TOTAL_HATCHERS,
      hatchPricePerToken: P0,
      fundingPoolHatchPercentage: (THETA / DENOMINATOR_PPM * 100) + "%",
      saleFeePercentage: SALE_FEE_PERCENTAGE + "%",
      artistName: ARTIST_NAME,
      artistSymbol: ARTIST_SYMBOL,
      subscribers: BUYERS,
      buyerCapitalPHT: BUYER_CAPITAL_PHT,
      buyerCapitalEuro: pht2euro(BUYER_CAPITAL_PHT) + "€",
      sellerRatio: SELLER_RATIO,
      sellerAmountRatio: SELLER_AMOUNT_RATIO,
      artistFundingPoolWithdrawPercentage: (ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100) + "%",
      hatcherSellPercentage: (HATCHER_SELL_RATIO * 100) + "%",
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

  it("should have hatchers with positive wPHT(PHT20) balances ready", async () => {
    await wPHT.deposit({
      from: hatcherSimulator,
      value: HATCHER_SIMULATOR_DEPOSIT_WEI
    });

    await wPHT.deposit({
      from: superHatcher,
      value: SUPER_HATCHER_CAPITAL_WEI
    });

    let avgHatchers = wei2pht(HATCHER_SIMULATOR_DEPOSIT_WEI) / AVERAGE_HATCHER_CAPITAL_PHT;

    const hatcherSimulatorWPHTBalance = await wPHT.balanceOf(hatcherSimulator);
    const superHatcherWPHTBalance = await wPHT.balanceOf(superHatcher);

    assert.equal(hatcherSimulatorWPHTBalance.toString(), HATCHER_SIMULATOR_DEPOSIT_WEI.toString());
    assert.equal(superHatcherWPHTBalance.toString(), SUPER_HATCHER_CAPITAL_WEI.toString());
  });

  it("should be in a 'hatching phase' after deployed", async () => {
    const isHatched = await artistToken.isHatched();

    assert.isFalse(isHatched);
  });

  it('should end the hatching phase by contributing configured minimum amount to raise from hatchers', async () => {
    await wPHT.approve(artistToken.address, HATCHER_SIMULATOR_DEPOSIT_WEI, {from: hatcherSimulator});
    await artistToken.hatchContribute(HATCHER_SIMULATOR_DEPOSIT_WEI, {from: hatcherSimulator});
    console.log("hatchContribute1");
    let contribution = await artistToken.initialContributions(hatcherSimulator);
    let hatcher1_lockedInternal = contribution.lockedInternal;
    let hatcher1_paidExternal = contribution.paidExternal;

    plot(null, "HTC", "B", hatcher1_lockedInternal, hatcher1_paidExternal);

    /*
    await wPHT.approve(artistToken.address, SUPER_HATCHER_CAPITAL_WEI, {from: superHatcher});
    await artistToken.hatchContribute(SUPER_HATCHER_CAPITAL_WEI, {from: superHatcher});
    console.log("hatchContribute2");

    contribution = await artistToken.initialContributions(superHatcher);
    let hatcher2_lockedInternal = contribution.lockedInternal;
    let hatcher2_paidExternal = contribution.paidExternal;

    plot(null, "HTC", "B", hatcher2_lockedInternal, hatcher2_paidExternal);
    */

    let isHatched = await artistToken.isHatched();

    const artistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const artistTokenTotalSupply = await artistToken.totalSupply();
    
    //const totalContributions = SUPER_HATCHER_CAPITAL_WEI.add(HATCHER_SIMULATOR_DEPOSIT_WEI);
    const totalContributions = HATCHER_SIMULATOR_DEPOSIT_WEI;
    raiseInternal = artistTokenTotalSupply;

    console.log("Economy after fully hatched:");
    console.log(` - total supply is ${wei2pht(artistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - total size is ${wei2pht(artistTokenWPHTBalance)} WPHT worth ${wei2euro(artistTokenWPHTBalance)}€`);
    console.log(` - hatchers contributed ${wei2pht(totalContributions)} WPHT worth ${wei2euro(totalContributions)}€`);
    console.log(` - hatchers artist token cost ${pricePerArtistToken(totalContributions, artistTokenTotalSupply)} €`);
    console.log(` - artist token price ${pricePerArtistToken(artistTokenWPHTBalance, artistTokenTotalSupply)} €`);

    assert.isTrue(isHatched);
  });

  it('should let an Artist to allocate raised funds from the FundingPool', async () => {
    const wPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const withdrawAmountWei = wPHTBalance.mul(new BN(ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100)).div(new BN(100));

    await fundingPool.allocateFunds(artistToken.address, artistAccountant, withdrawAmountWei, { from: artist });

    console.log(`Artist withdrawn ${ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100}% of tokens, ${wei2pht(withdrawAmountWei)} WPHT, worth ${wei2euro(withdrawAmountWei)}€ from FundingPool to an external account`);

    const accountantWPHTBalance = await wPHT.balanceOf(artistAccountant);

    assert.equal(accountantWPHTBalance.toString(), withdrawAmountWei.toString());
  });

  it('should simulate configured market activity from .env file and print economy state', async () => {

    if (BUYERS === 0) {
      console.log("No post-hatch buying simulation is happening because BUYERS setting is set to 0");
      return;
    }

    const preFeeRecipientWPHTBalance = await wPHT.balanceOf(feeRecipient);
   
    //subscribers = BUYERS;


    subscriptionPriceWei = pht2wei(100);

    let year = YEAR;
    for (month = 1; month <= SIMULATION_MONTHS; month ++) {
      let fanIndex = 0;
      startDay = day;
      endDay = day + daysInMonth(month, year);

      if (month === 2) {
        //subscriptionPriceWei = await artistToken.calculateCurvedMintReturn(pht2wei(250));
      }

      console.log(`Month: ${month}`);

      if (month > 5 ) {
        await hatcherSell(hatcherSimulator, 10);
      }
      
      while(day < endDay) {
        day++;
        let date = day - startDay;

        for (let fanIndex = 0; fanIndex < fans.length; fanIndex++) {
          let fan = fans[fanIndex];

          if (fan.buyDay === date && fan.month <= month) {
            if (PRINT_MARKET_ACTIVITY) {
              console.log(`Month: ${month} date: ${date} day: ${day}`);  
              console.log(`Fan ${fanIndex}:`);
            }

            if (fan.isSubscriber) {
              await simulateSubscriber(fan);
            } else {
              await simulateSpeculator(fan);
            }

            if (!fan.isActive) {
              fan.isActive = true;

              if (fan.isSubscriber) {
                subscribers ++;
              } else {
                speculators ++;
              }
            }

            if (prevDay !== day) {
              prevDay = day;

              dayOpen = tokenPrice;
              dayHigh = tokenPrice;
              dayLow = tokenPrice;
            }

            if (month !== prevMonth) {
              prevMonth = month;

              monthOpen = tokenPrice;
              monthHigh = tokenPrice;
              monthLow = tokenPrice;

            } else {
              if (tokenPrice > dayHigh) {
                dayHigh = tokenPrice;
              }

              if (tokenPrice > monthHigh) {
                monthHigh = tokenPrice;
              }

              if (tokenPrice < dayLow) {
                dayLow = tokenPrice;
              } 

              if (tokenPrice < monthLow) {
                monthLow = tokenPrice;
              } 
            }

            dayClose = tokenPrice;
            monthClose = tokenPrice;
          }
        }

        //await plotOHLV(streamDayOHLC, day, dayOpen, dayClose, dayHigh, dayLow, dayVol);
        dayVol = 0;
      }

      await plotMonth(streamMonthOHLC, month, monthOpen, monthClose, monthHigh, monthLow, monthVol);
      monthVol = 0;
      artistRevenueMonth = new BN(0);
      projectRevenueMonth = new BN(0);
    }

    const fundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const artistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const postFeeRecipientWPHTBalance = await wPHT.balanceOf(feeRecipient);
    const feeRecipientProfit = postFeeRecipientWPHTBalance.sub(preFeeRecipientWPHTBalance);
    const artistTokenTotalSupply = await artistToken.totalSupply();

    console.log(`Artist:`);
    console.log(` - has limit ${HATCH_LIMIT_PHT} WPHT worth ${pht2euro(HATCH_LIMIT_PHT)}€ reached`);
    console.log(` - has ${wei2pht(fundingPoolWPHTBalance)} WPHT worth ${wei2euro(fundingPoolWPHTBalance)}€ in disposition to spend on equipment, etc from the funding pool`);
    console.log(` - total supply of his economy is ${wei2pht(artistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - total size of his economy is ${wei2pht(artistTokenWPHTBalance)} WPHT worth ${wei2euro(artistTokenWPHTBalance)}€`);

    console.log(`FeeRecipient charging ${SALE_FEE_PERCENTAGE}% from each sale earned ${wei2pht(feeRecipientProfit)} WPHT worth ${wei2euro(feeRecipientProfit)}€ from all market activity`);
  }).timeout(5000000);

/*
  it('should let a super hatcher to claim his tokens', async () => {
    const contribution = await artistToken.initialContributions(superHatcher);
    const lockedInternal = contribution.lockedInternal;

    await artistToken.claimTokens({from: superHatcher});

    const balance = await artistToken.balanceOf(superHatcher);

    console.log(`A super hatcher claimed ${wei2pht(balance)} / ${wei2pht(lockedInternal)} ${artistTokenSymbol}`);
  });
  /*/

  it('should let average hatchers to claim their tokens', async () => {
    const contribution = await artistToken.initialContributions(hatcherSimulator);
    const lockedInternal = contribution.lockedInternal;

   //await artistToken.claimTokens({from: hatcherSimulator});

    console.log(`Hatcher has ${wei2pht(lockedInternal)} ${artistTokenSymbol} locked tokens remaining`);

    hatcherSell(hatcherSimulator); 
  });

/*
  it('should let super hatcher to sell his claimed tokens', async () => {
    if (HATCHER_SELL_RATIO === 0) {
      console.log("No hatchers selling simulation is happening because HATCHER_SELL_RATIO setting is set to 0.0");
      return;
    }

    const wPHTBalance = await wPHT.balanceOf(superHatcher);
    const artistTokensBalance = await artistToken.balanceOf(superHatcher);
    const burnAmountPHT = wei2pht(artistTokensBalance);
    const burnAmountWei = pht2wei(burnAmountPHT);

    if (burnAmountPHT === 0) {
      console.log("Hatcher has no unlocked tokens to sell.");
      return;
    }

    await artistToken.burn(burnAmountWei, {from: superHatcher, gasPrice: GAS_PRICE_WEI});

    const postWPHTBalance = await wPHT.balanceOf(superHatcher);
    const revenue = postWPHTBalance.sub(wPHTBalance);

    console.log(`A super hatcher:`);
    console.log(` sold ${HATCHER_SELL_RATIO * 100}%, ${burnAmountPHT} ${artistTokenSymbol} for ${wei2euro(revenue)}€`);
    console.log(` gained ${calcPercentageIncrease(SUPER_HATCHER_CAPITAL_PHT * HATCHER_SELL_RATIO, wei2pht(revenue))}% in profit`);
  });
  */

  it('should let average hatchers to sell their claimed tokens', async () => {
    if (HATCHER_SELL_RATIO === 0) {
      console.log("No hatchers selling simulation is happening because HATCHER_SELL_RATIO setting is set to 0.0");
      return;
    }

    hatcherSell(hatcherSimulator);  

    streamPlot.end();
    streamMonthOHLC.end();
    streamDayOHLC.end();
  });
});
