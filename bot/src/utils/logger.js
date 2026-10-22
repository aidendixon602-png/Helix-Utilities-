const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const current = levels[process.env.LOG_LEVEL] || levels.info;
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const make = (lvl, fn) => (...args) => {
  if (levels[lvl] >= current) fn(`[${stamp()}] ${lvl.toUpperCase().padEnd(5)}`, ...args);
};

module.exports = {
  debug: make('debug', console.log),
  info: make('info', console.log),
  warn: make('warn', console.warn),
  error: make('error', console.error),
};
