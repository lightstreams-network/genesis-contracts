require('dotenv').config({ path: `${process.env.PWD}/.env` });
const { daysInMonth } = require('./utils');
const { BN } = require('openzeppelin-test-helpers')

function generateFans(fans, amount, month, days, isSubscriber) {
  let currentNumOfFans = fans.length;
  for (let index = currentNumOfFans; index < currentNumOfFans + amount; index++) {
    fans[index] = {
        id: index,
        isSubscriber: isSubscriber,
        isActive: false,
        month: month,
        buyDay: Math.floor(Math.random() * days) + 1,
        sellMonth: Math.floor(month + (Math.random() * 6)),
        sold: false,
        selling: false,
        tokens: new BN("0"),
        targetGain: ((Math.random() * 150) + 20)/100
      };
  }

  return fans;
}

module.exports.generateFans = (year, months, initSubscriber, initSpeculators, growthSubscribers, growthSpeculators)=>{
    let fans = [];

    // Subscribers
    let subscriberCount = initSubscriber;
    let numOfNew = initSubscriber;
    for (let month = 1; month <= months; month ++) {
        let days = daysInMonth(month, year);
        fans = generateFans(fans, numOfNew, month, days, true);
        
        if (month <= 12) {
          numOfNew = Math.round(subscriberCount * growthSubscribers);
          subscriberCount += subscriberCount * growthSubscribers;
        } else {
          numOfNew = Math.round(numOfNew * 0.5);
          subscriberCount += numOfNew;
        }
    }

    // Speculators
    let speculatorCount = initSpeculators;
    numOfNew = initSpeculators;
    for (let month = 1; month <= months; month ++) {  
        let days = daysInMonth(month, year);
        fans = generateFans(fans, numOfNew, month, days, false);
        
        numOfNew = Math.round(speculatorCount * growthSpeculators);
        speculatorCount += speculatorCount * growthSpeculators;
    }

    return fans.sort((a, b) => (a.month * 100 + a.buyDay) -  (b.month * 100 + b.buyDay));;
};

