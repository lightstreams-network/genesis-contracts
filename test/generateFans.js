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
        sellMonth: Math.floor(Math.random() * 12),
        tokens: new BN("0")
      };
  }

  return fans;
}

module.exports.generateFans = (year, initSubscriber, initSpeculators, growthSubscribers, growthSpeculators)=>{
    let fans = [];

    // Subscribers
    let subscriberCount = initSubscriber;
    let numOfNew = initSubscriber;
    for (let month = 1; month <= 18; month ++) {
        let days = daysInMonth(month, year);
        fans = generateFans(fans, numOfNew, month, days, true);
        
        numOfNew = Math.round(subscriberCount * growthSubscribers);
        subscriberCount += subscriberCount * growthSubscribers;
    }

    // Speculators
    let speculatorCount = initSpeculators;
    numOfNew = initSpeculators;
    for (let month = 1; month <= 18; month ++) {  
        let days = daysInMonth(month, year);
        fans = generateFans(fans, numOfNew, month, days, false);
        
        numOfNew = Math.round(speculatorCount * growthSpeculators);
        speculatorCount += speculatorCount * growthSpeculators;
    }

    return fans.sort((a, b) => (a.month * 100 + a.buyDay) -  (b.month * 100 + b.buyDay));;
};

