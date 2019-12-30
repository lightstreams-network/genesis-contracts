require('dotenv').config({ path: `${process.env.PWD}/.env` });
const { daysInMonth } = require('./utils');

function generateFans(fans, amount, month, days, isSubscriber) {
  let currentNumOfFans = fans.length;
  for (let subscriberIndex = currentNumOfFans; subscriberIndex < currentNumOfFans + amount; subscriberIndex++) {
    fans[subscriberIndex] = {
        id: subscriberIndex,
        subscriber: isSubscriber,
        isSubscribed: false,
        month: month,
        buyDay: Math.floor(Math.random() * days) + 1,
        tokens: 0
      };
  }

  return fans;
}

module.exports.generateFans = ()=>{
    let fans = [];

    let year = 2020;
    let dayCount = 0;
    let growth = 0.10;

    let numOfNew = 30;
    for (let month = 1; month <= 12; month ++) {
        let days = daysInMonth(month, year);
        fans = generateFans(fans, numOfNew, month, days, true);
        
        numOfNew = Math.ceil(fans.length*growth);
    }

    /*
    numOfNew = 5;
    growth = 0.5;
    for (let month = 1; month <= 3; month ++) {
        let days = daysInMonth(month, year);
        fans = generateFans(fans, numOfNew, dayCount, days, false);
        
        dayCount += days;
        numOfNew = Math.round(fans.length*growth);
    }
    */

    return fans.sort((a, b) => (a.month * 100 + a.buyDay) -  (b.month * 100 + b.buyDay));;
};

