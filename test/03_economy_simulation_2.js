/**

 * User: Michael Smolenski
 * Date: 20/12/19 14:44
 * Copyright 2019 (c) Lightstreams
 */

require('dotenv').config({ path: `${process.env.PWD}/.env` });
const fs = require('fs');

const { BN } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht, pht2euro, wei2euro, pricePerArtistToken, calcPercentageIncrease, daysInMonth, artist2wei, wei2artist} = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

const { generateFans } = require('./generateFans');

let subscribers = generateFans();

contract("EconomySimulation", ([lsAcc, artist, artistAccountant, superHatcher, hatcherSimulator, buyer1, buyerSimulator, lastBuyer, feeRecipient]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;
  let totalSupply;
  let tokenWPHTBalance;
  let tokenPrice;
  let day = 0;
  let buyers = 0;
  let speculators = 0;
  let month = 0;

  const HATCH_LIMIT_PHT = process.env.HATCH_LIMIT_PHT;
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);
  const SUBSCRIPTION_PRICE = artist2wei(50);
  const MIN_FAN_BALANCE = artist2wei(30);
  const SUPER_HATCHER_CAPITAL_PHT = process.env.SUPER_HATCHER_CAPITAL_PHT;
  const SUPER_HATCHER_CAPITAL_WEI = pht2wei(SUPER_HATCHER_CAPITAL_PHT);
  const AVERAGE_HATCHER_CAPITAL_PHT = process.env.AVERAGE_HATCHER_CAPITAL_PHT;
  const AVERAGE_HATCHER_CAPITAL_WEI = pht2wei(AVERAGE_HATCHER_CAPITAL_PHT);
  const HATCHER_SIMULATOR_DEPOSIT_WEI = HATCH_LIMIT_WEI;  
  const TOTAL_HATCHERS = ((HATCH_LIMIT_PHT - SUPER_HATCHER_CAPITAL_PHT) / AVERAGE_HATCHER_CAPITAL_PHT) + 1;
  const SUPER_HATCHERS = 1;
  const AVERAGE_HATCHERS = TOTAL_HATCHERS - SUPER_HATCHERS;

  const DENOMINATOR_PPM = 1000000;
  // kappa ~ 6 -> 1/7 * 1000000 = 142857
  // kappa ~ 1.25 (5/4) -> 1/2.25 * 1000000 = 444444
  const RESERVE_RATIO="444444";
  const THETA = process.env.FUNDING_POOL_HATCH_PERCENTAGE;
  const P0 =  process.env.HATCH_PRICE_PER_TOKEN;
  const FRICTION = process.env.SALE_FEE_PERCENTAGE;
  const GAS_PRICE_WEI = process.env.GAS_PRICE_WEI;
  const HATCH_DURATION_SECONDS = process.env.HATCH_DURATION_SECONDS;
  const HATCH_VESTING_DURATION_SECONDS = process.env.HATCH_VESTING_DURATION_SECONDS;

  const ARTIST_NAME = 'Lightstreams Van Economy';
  const ARTIST_SYMBOL = 'LVE';

  const BUYERS = parseInt(process.env.BUYERS);
  const BUYER_CAPITAL_PHT = process.env.BUYER_CAPITAL_PHT;
  const BUYER_CAPITAL_WEI = pht2wei(BUYER_CAPITAL_PHT);

  const SELLER_RATIO = parseFloat(process.env.SELLER_RATIO);
  const SELLER_AMOUNT_RATIO = parseFloat(process.env.SELLER_AMOUNT_RATIO);
  const SELLERS = Math.round(BUYERS * SELLER_RATIO);

  const ARTIST_FUNDING_POOL_WITHDRAW_RATIO = parseFloat(process.env.ARTIST_FUNDING_POOL_WITHDRAW_RATIO);
  const HATCHER_SELL_RATIO = parseFloat(process.env.HATCHER_SELL_RATIO);

  const PRINT_MARKET_ACTIVITY = process.env.PRINT_MARKET_ACTIVITY === "true";

  const SALE_FEE_PERCENTAGE = (FRICTION / DENOMINATOR_PPM * 100);
  const MIN_HATCH_CONTRIBUTION_WEI = pht2wei(1);

  let subscriptionPriceWei = artist2wei(30);

  if (PRINT_MARKET_ACTIVITY) {
    for (let subscriberIndex = 0; subscriberIndex < subscribers.length; subscriberIndex++) {
      console.log(`Index: ${subscriberIndex}, buyDay: ${subscribers[subscriberIndex].buyDay}, month: ${subscribers[subscriberIndex].month}, sellMonth: ${subscribers[subscriberIndex].sellMonth}`);
    }
  }

  const writableStream = fs.createWriteStream("./simulationOuputFile.csv");
  writableStream.write('Month, Day, Fan_ID, Fan_Type, BS, ArtistToken_Value, Euro_Value, Speculators, Buyers, Price, Artist_Token_Supply, Pool_Balance_PHT, Fee_balance\n');

  writePrice = async (fan, fanType, bs, artistValueWei, valueWei) => {
    totalSupply = await artistToken.totalSupply();
    tokenWPHTBalance = await wPHT.balanceOf(artistToken.address);   
    //tokenPrice = pricePerArtistToken(tokenWPHTBalance, totalSupply);
    tokenPrice = pricePerArtistToken(valueWei, artistValueWei);
    //tokenPrice = artistValueWei.div(valueWei);

    if (totalSupply.gt(pht2wei(new BN("200000")))) {
      subscriptionPriceWei = artist2wei(15);
    }

    let feeBalance = await wPHT.balanceOf(feeRecipient);

    writableStream.write(month.toString());
    writableStream.write(", ");
    writableStream.write(month.toString());
    writableStream.write(", ");

    let fan_id = 0;
    if (fan) {
      fan_id = fan.id;
    }
    writableStream.write(fan_id.toString());
    writableStream.write(", ");
    writableStream.write(fanType);
    writableStream.write(", ");
    writableStream.write(bs);
    writableStream.write(", ");
    writableStream.write(parseFloat(wei2artist(artistValueWei)).toFixed(0));
    writableStream.write(", ");
    writableStream.write(wei2euro(valueWei));
    writableStream.write(", ");
    writableStream.write(speculators.toString());
    writableStream.write(", ");
    writableStream.write(buyers.toString());
    writableStream.write(", ");
    writableStream.write(parseFloat(tokenPrice).toFixed(4));
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(totalSupply)).toString());
    writableStream.write(", ");
    writableStream.write(Math.round(wei2pht(tokenWPHTBalance)).toString());
    writableStream.write(", ");
    writableStream.write(wei2euro(feeBalance).toString());
    writableStream.write("\n");
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

  hatcherSell = async (hatcher) => {
    console.log(`claiming tokens`);
    await artistToken.claimTokens({from: hatcher});

    let balance = await artistToken.balanceOf(hatcher);
    console.log(`Hatcher claimed ${wei2pht(balance)}`);

    const curBalance = await wPHT.balanceOf(hatcher);

    const sellAmount = balance;
    await artistToken.burn(sellAmount, {from: hatcher, gasPrice: GAS_PRICE_WEI});
    
    const newBalance = await wPHT.balanceOf(hatcher);
    const revenue = newBalance.sub(curBalance);

    console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
    writePrice(null, "HTC", "S", sellAmount, revenue);
  }

  simulateSubscriber = async (fan) => {
    const curBalance = await artistToken.balanceOf(buyerSimulator);

    //let subscriptionPrice = wei2artist(totalSupply) / (wei2pht(tokenWPHTBalance) * process.env.PHT_PRICE_EURO * 3);
    //subscriptionPrice = Math.floor(subscriptionPrice);

    //let subscriptionPriceWei = artist2wei(subscriptionPrice);

    if (!fan.tokens || fan.tokens.sub(subscriptionPriceWei).lt(MIN_FAN_BALANCE)) {
      console.log(`sub buy`); 
      const artistTokenTotalSupply = await artistToken.totalSupply();
    
      console.log(` - total supply is ${wei2pht(artistTokenTotalSupply)} ${artistTokenSymbol}`);

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

      writePrice(fan, "SUB", "B", purchasedAmount, topUpAmount);
    }

    if (fan.buyDay !== day) {
      console.log(`sub sell`);
      const curBalance = await wPHT.balanceOf(buyerSimulator);

      const sellAmount = subscriptionPriceWei;
      await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
      
      const newBalance = await wPHT.balanceOf(buyerSimulator);
      const revenue = newBalance.sub(curBalance);

      fan.tokens = fan.tokens.sub(sellAmount);

      writePrice(fan, "AST", "S", sellAmount, revenue);

      if (PRINT_MARKET_ACTIVITY) {
        console.log(` sold ${wei2artist(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
      }
    }
  };

  simulateSpeculator = async (fan) => {
    const curBalance = await artistToken.balanceOf(buyerSimulator);

    if (fan.month === month) {
      console.log(`spec buy`); 
      let topUpAmount = 20000;
      topUpAmount = pht2wei(topUpAmount);
      
      await wPHT.deposit({ from: buyerSimulator, value: topUpAmount });
      await wPHT.approve(artistToken.address, topUpAmount, {from: buyerSimulator});
      await artistToken.mint(topUpAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);
      fan.tokens = purchasedAmount;

      if (PRINT_MARKET_ACTIVITY) {
        console.log(` purchased ${wei2artist(purchasedAmount)} ${artistTokenSymbol} for ${wei2pht(topUpAmount)} WPHT worth ${wei2euro(topUpAmount)}€`);
      }

      writePrice(fan, "SPC", "B", purchasedAmount, topUpAmount);
    }

    if (fan.sellMonth === month ) {

      if (fan.tokens ) {
        console.log(`spec sell`); 
        const curBalance = await wPHT.balanceOf(buyerSimulator);

        let sellAmount = fan.tokens.div(new BN("2"));
        //sellAmount = pht2wei(sellAmount);

        await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});
        
        const newBalance = await wPHT.balanceOf(buyerSimulator);
        const revenue = newBalance.sub(curBalance);

        fan.tokens = fan.tokens.sub(sellAmount);

        writePrice(fan, "SPC", "S", sellAmount, revenue);

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
      buyers: BUYERS,
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

    writePrice(null, "HTC", "B", hatcher1_lockedInternal, hatcher1_paidExternal);

    /*
    await wPHT.approve(artistToken.address, SUPER_HATCHER_CAPITAL_WEI, {from: superHatcher});
    await artistToken.hatchContribute(SUPER_HATCHER_CAPITAL_WEI, {from: superHatcher});
    console.log("hatchContribute2");

    contribution = await artistToken.initialContributions(superHatcher);
    let hatcher2_lockedInternal = contribution.lockedInternal;
    let hatcher2_paidExternal = contribution.paidExternal;

    writePrice(null, "HTC", "B", hatcher2_lockedInternal, hatcher2_paidExternal);
    */

    let isHatched = await artistToken.isHatched();

    const artistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const artistTokenTotalSupply = await artistToken.totalSupply();
    
    //const totalContributions = SUPER_HATCHER_CAPITAL_WEI.add(HATCHER_SIMULATOR_DEPOSIT_WEI);
    const totalContributions = HATCHER_SIMULATOR_DEPOSIT_WEI;

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
   
    //buyers = BUYERS;

    let year = 2020;
    for (month = 1; month <= 12; month ++) {
      let fanIndex = 0;
      startDay = day;
      endDay = day + daysInMonth(month, year);

      console.log(`Month: ${month}`);

      if (month === 1) {
        await hatcherSell(hatcherSimulator);
      }
      
      while(day < endDay) {
        day++;
        let date = day - startDay;

        for (let fanIndex = 0; fanIndex < subscribers.length; fanIndex++) {
          let fan = subscribers[fanIndex];

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
                buyers ++;
              } else {
                speculators ++;
              }
            }
          }
        }
      }
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
  });

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

    writableStream.end();
  });
});
