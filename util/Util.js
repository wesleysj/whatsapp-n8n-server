'use strict';

/**
 * Utility methods
 */
class Util {
  constructor() {
      throw new Error(`The ${this.constructor.name} class may not be instantiated.`);
  }
  
  /**
   * Format phone number.
   * @param {String} number Default properties
   * @returns {String}
   * @private
   */
  static formatPhoneNumber(number) {
    const numberDDI = number.slice(0, 2);
    const numberDDD = number.slice(2, 4);
    const numberUser = number.slice(-8);
    
    if (numberDDI !== "55") {
      number = number + "@c.us";
    }
    else if (numberDDI === "55" && parseInt(numberDDD) <= 30) {
      number = "55" + numberDDD + "9" + numberUser + "@c.us";
    }
    else if (numberDDI === "55" && parseInt(numberDDD) > 30) {
      number = "55" + numberDDD + numberUser + "@c.us";
    }
      
    return number;
  }
  
  static maskNumber(num) {
    if (!num) return num;
    const digits = String(num).replace(/\D/g, '');
    if (digits.length <= 4) return '*'.repeat(digits.length);
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const meio = digits.slice(4, -2);
    const fim = digits.slice(-2);
    return `${ddi}${ddd}${'*'.repeat(meio.length)}${fim}`;
  }

  static trunc(str, max = 60) {
    if (!str) return '';
    return str.length > max ? `${str.slice(0, max)}…` : str;
  }
}

module.exports = Util;
