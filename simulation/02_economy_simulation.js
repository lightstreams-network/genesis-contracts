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
  let date = 0;
  let month = 0;
  let prevDay = -1;
  let prevMonth = -1;
  let subscribers = 0;
  let speculators = 0;

  const PRINT_MARKET_ACTIVITY = false;

  const SIMULATION_MONTHS = 18;
  const INIT_SUBSCRIBERS = 30;
  const INIT_SPECULATORS = 1;
  const SUBSCRIBER_GROWTH = 0.20;
  const SPECULATOR_GROWTH = 0.35;
  const YEAR = 2020;

  const HATCH_LIMIT_PHT = "250000";
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);

  // 3€
  const MIN_FAN_BALANCE = "30";
  const MIN_FAN_BALANCE_WEI = artist2wei(MIN_FAN_BALANCE);

  const DENOMINATOR_PPM = 1000000;

  // kappa ~ 6 -> 1/7 * 1000000 = 142857
  // kappa ~ 3 -> 1/4 * 1000000 = 254444
  // kappa ~ 2 -> 1/3 * 1000000 = 333333
  // kappa ~ 1.25 (5/4) -> 1/2.25 * 1000000 = 444444
  const RESERVE_RATIO="142857";
  // 40%
  const THETA = "400000";
  // 1.60
  const P0 =  "2500000";
  // 10%
  const FRICTION = "100000";
  const GAS_PRICE_WEI = "15000000000";
  const HATCH_DURATION_SECONDS = "3024000";
  const HATCH_VESTING_DURATION_SECONDS = "0";

  const ARTIST_NAME = 'Lightstreams Van Economy';
  const ARTIST_SYMBOL = 'LVE';

  const ARTIST_FUNDING_POOL_WITHDRAW_RATIO = parseFloat("1.0");

  const SALE_FEE_PERCENTAGE = (FRICTION / DENOMINATOR_PPM * 100);
  const MIN_HATCH_CONTRIBUTION_WEI = pht2wei(1);

  // Percentage of unlocked tokens that the hatcher will sell.
  const HATCHER_SELL_PERCENT = "3"

  // Month when hatch begins selling
  const HATCHER_BEGIN_SELL_MONTH = 12;

  // 100 Artist Tokens
  const INIT_SUBSCRIPTION_PRICE = "100";

  // 5 €
  const MAX_SUBSCRIPTION_PRICE_PHT = "500";

  let subscriptionPriceWei = artist2wei(100);

  let fans = generateFans(YEAR, SIMULATION_MONTHS, INIT_SUBSCRIBERS, INIT_SPECULATORS, SUBSCRIBER_GROWTH, SPECULATOR_GROWTH);

  if (PRINT_MARKET_ACTIVITY) {
    for (let subscriberIndex = 0; subscriberIndex < fans.length; subscriberIndex++) {
      console.log(`Index: ${subscriberIndex}, buyDay: ${fans[subscriberIndex].buyDay}, month: ${fans[subscriberIndex].month}, sellMonth: ${fans[subscriberIndex].sellMonth}, subscriber: ${fans[subscriberIndex].isSubscriber}`);
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

  let exchangeRate = 0;

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

    exchangeRate = wei2pht(externalWei) / wei2artist(internalWei);
    let externalInternalRatio = wei2pht(totalSupplyExternal) / wei2artist(totalSupplyInternal);
    tokenPrice = pricePerArtistToken(externalWei, internalWei);
    tokenPrice = parseFloat(tokenPrice).toFixed(4);

    const feeBalance = await wPHT.balanceOf(feeRecipient);
    const hatcherBalance = await wPHT.balanceOf(hatcherSimulator);
    let projectBalance = feeBalance.add(hatcherBalance);

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
    streamPlot.write(parseFloat(exchangeRate).toFixed(4));
    streamPlot.write(", ");
    streamPlot.write(tokenPrice.toString());
    streamPlot.write(", ");
    streamPlot.write(parseFloat(externalInternalRatio).toFixed(4));
    streamPlot.write(", ");
    streamPlot.write(wei2euro(projectBalance).toString());
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

    const sellAmount = balance.mul(new BN(percentage)).div(new BN(100));
    await artistToken.burn(sellAmount, {from: hatcher, gasPrice: GAS_PRICE_WEI});
    
    const newBalance = await wPHT.balanceOf(hatcher);
    projectBal = await wPHT.balanceOf(feeRecipient);

    const revenue = newBalance.sub(curBalance);
    const projectRevenue = projectBal.sub(projectCurrentBalance);

    //projectRevenueMonth = projectRevenueMonth.add(projectRevenue);
    projectRevenueMonth = projectRevenueMonth.add(revenue);

    console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
    await plot(null, "HTC", "S", sellAmount, revenue);
  }

  simulateSubscriber = async (fan) => {
    
    if (PRINT_MARKET_ACTIVITY) {
      console.log(`Month: ${month} date: ${date} day: ${day}`);  
      console.log(`subscriber: ${fan.id}`);
      console.log(`buyDay: ${fan.buyDay}`);
      console.log(`buyMonth: ${fan.month}`);
    }

    let curBalance = await artistToken.balanceOf(buyerSimulator);

    if (!fan.tokens || fan.tokens.sub(subscriptionPriceWei).lt(subscriptionPriceWei)) {

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

      await plot(fan, "SUB", "B", purchasedAmount, topUpAmount);

      if (!fan.isActive) {
        fan.isActive = true;
        subscribers ++;

        return; // First month subscription is a deposit and does not go to the Artist. 
      }
    }

    curBalance = await wPHT.balanceOf(buyerSimulator);

    let projectCurrentBalance = await wPHT.balanceOf(feeRecipient);

    //sellAmount = subscriptionPriceWei.mul(new BN(50)).div(new BN(100));
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
    
    await plot(fan, "AST", "S", sellAmount, revenue);

    if (wei2pht(revenue) > MAX_SUBSCRIPTION_PRICE_PHT) {
      subscriptionPriceWei = subscriptionPriceWei.div(new BN("2"));
    }

    if (PRINT_MARKET_ACTIVITY) {
      console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
    }
  };

  /*
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
  }*/

  specBuyAmount = () => {
    let rand = Math.floor(Math.random() * 100);
    if (rand < 50) {
      return 5000;
    }
    if (rand < 85) {
      return 10000;
    }

    return 20000;
  }

  specSellAmount = (speculator) => {
    let tokens = speculator.tokens;
    let rand = Math.floor(Math.random() * 100);
    if (rand < 50) {
      return tokens.mul(new BN("50")).div(new BN("100"));
    }
    if (rand < 70) {
      return tokens.mul(new BN("70")).div(new BN("100"));
    }

    return tokens;
  }

  specSell = async (speculator) => {
    if (speculator.tokens.lte(new BN(0)) ) {
      return;
    }

    if (speculator.sold) {
      return;
    }


    let targetExchange = speculator.exchangeRate + speculator.exchangeRate * speculator.targetGain;

    
    console.log(`Month: ${month} date: ${date} day: ${day}`);
    console.log(`speculator: ${speculator.id} (SELL)`);
    console.log(`prev exchangeRate rate: ${speculator.exchangeRate}`);
    console.log(`targetGain: ${speculator.targetGain}`);
    console.log(`targetExchange: ${targetExchange}`);
    console.log(`exchangeRate rate: ${exchangeRate}`);

    if (exchangeRate <= targetExchange) {
      //speculator.selling = false;
      return;
    }
  
    console.log(`******* SELLING ****** \n`);
    console.log(`tokens: ${speculator.tokens}`);
    console.log(`buyDay: ${speculator.buyDay}`);
    console.log(`buyMonth: ${speculator.month}`);
    console.log(`sellMonth: ${speculator.sellMonth}`);
    console.log(`selling: ${speculator.selling}`);

    let curBalance = await wPHT.balanceOf(buyerSimulator);

    const projectCurrentBalance = await wPHT.balanceOf(feeRecipient);

    let sellAmount = specSellAmount(speculator);

    await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
    
    const newBalance = await wPHT.balanceOf(buyerSimulator);
    projectBal = await wPHT.balanceOf(feeRecipient);

    const revenue = newBalance.sub(curBalance);
    const projectRevenue = projectBal.sub(projectCurrentBalance);

    projectRevenueMonth = projectRevenueMonth.add(projectRevenue);

    speculator.tokens = speculator.tokens.sub(sellAmount);

    await plot(speculator, "SPC", "S", sellAmount, revenue);
    speculator.sold = true;
    speculator.selling = false;


    if (PRINT_MARKET_ACTIVITY) {
      console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
    }
  }

  simulateSpeculator = async (speculator) => {

    if (speculator.month === month && speculator.buyDay === date ) {
      if (PRINT_MARKET_ACTIVITY) {
        console.log(`Month: ${month} date: ${date} day: ${day}`);  
        console.log(`speculator: ${speculator.id} (BUY)`);
        console.log(`buyDay: ${speculator.buyDay}`);
        console.log(`buyMonth: ${speculator.month}`);
        console.log(`sellMonth: ${speculator.sellMonth}`);
      }

      let topUpAmount = specBuyAmount(speculator);
      topUpAmount = pht2wei(topUpAmount);

      let curBalance = await artistToken.balanceOf(buyerSimulator);
      
      await wPHT.deposit({ from: buyerSimulator, value: topUpAmount });
      await wPHT.approve(artistToken.address, topUpAmount, {from: buyerSimulator});
      await artistToken.mint(topUpAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);

      if (PRINT_MARKET_ACTIVITY) {
        console.log(` purchased ${wei2artist(purchasedAmount)} ${artistTokenSymbol} for ${wei2pht(topUpAmount)} WPHT worth ${wei2euro(topUpAmount)}€`);
      }

      if (!speculator.isActive) {
        speculator.isActive = true;
        speculators ++;
      }

      await plot(speculator, "SPC", "B", purchasedAmount, topUpAmount);

      speculator.tokens = purchasedAmount;
      speculator.exchangeRate = exchangeRate;
      speculator.selling = false;
    }

    if (speculator.sellMonth === month || speculator.selling) {
      speculator.selling = true;
      await specSell(speculator);
    }
  };

  it('should print economy settings', async () => {

    console.log({
      hatchLimitPHT: HATCH_LIMIT_PHT,
      hatchLimitEuro: pht2euro(HATCH_LIMIT_PHT) + "€",
      hatchDurationSeconds: HATCH_DURATION_SECONDS,
      hatchVestingDurationSeconds: HATCH_VESTING_DURATION_SECONDS,
      hatchPricePerToken: P0,
      fundingPoolHatchPercentage: (THETA / DENOMINATOR_PPM * 100) + "%",
      saleFeePercentage: SALE_FEE_PERCENTAGE + "%",
      artistName: ARTIST_NAME,
      artistSymbol: ARTIST_SYMBOL,
      artistFundingPoolWithdrawPercentage: (ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100) + "%"
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

  it('should end the hatching phase by contributing configured minimum amount to raise from hatchers', async   () => {
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

    const artistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const artistTokenTotalSupply = await artistToken.totalSupply();
    
    const totalContributions = HATCH_LIMIT_WEI;
    raiseInternal = artistTokenTotalSupply;

    await plot(null, "HTC", "B", hatcher1_lockedInternal, hatcher1_paidExternal);

    console.log("Economy after fully hatched:");
    console.log(` - total supply is ${wei2pht(artistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - total size is ${wei2pht(artistTokenWPHTBalance)} WPHT worth ${wei2euro(artistTokenWPHTBalance)}€`);
    console.log(` - hatchers contributed ${wei2pht(totalContributions)} WPHT worth ${wei2euro(totalContributions)}€`);
    console.log(` - hatchers artist token cost ${parseFloat(pricePerArtistToken(totalContributions, artistTokenTotalSupply), 4)} €`);
    console.log(` - artist token price ${parseFloat(pricePerArtistToken(artistTokenWPHTBalance, artistTokenTotalSupply), 4)} €`);

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

    const preFeeRecipientWPHTBalance = await wPHT.balanceOf(feeRecipient);

    let year = YEAR;
    for (month = 1; month <= SIMULATION_MONTHS; month ++) {
      let fanIndex = 0;
      startDay = day;
      endDay = day + daysInMonth(month, year);

      console.log(`Month: ${month}`);

      if (month >= HATCHER_BEGIN_SELL_MONTH ) {
        await hatcherSell(hatcherSimulator, HATCHER_SELL_PERCENT);
      }
      
      while(day < endDay) {
        day++;
        date = day - startDay;

        for (let fanIndex = 0; fanIndex < fans.length; fanIndex++) {
          let fan = fans[fanIndex];

          if (fan.isSubscriber) {
            if (!fan.isActive && fan.buyDay === date && fan.month === month) {
              await simulateSubscriber(fan);
            } else if (fan.isActive && fan.buyDay === date) {
              await simulateSubscriber(fan);
            }
          } else {
            await simulateSpeculator(fan);
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

  it('should close streams', async () => {
    
    streamPlot.end();
    streamMonthOHLC.end();
    streamDayOHLC.end();
  });
});
