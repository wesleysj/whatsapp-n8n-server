const pino = require('pino');

const level = process.env.LOG_LEVEL || 'info';

module.exports = pino({ level });
