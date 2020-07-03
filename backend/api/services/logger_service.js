const { format, loggers, transports } = require('winston')

const defaultFormat = format.printf(({ level, message, label, timestamp }) => {
  return `${timestamp} ${level.toUpperCase()}: ${message}`;
});

const ts = {
  error: new transports.File({ filename: 'appdata/logs/error.log', level: 'error' }),
  combined: new transports.File({ filename: 'appdata/logs/combined.log' }),
  console: new transports.Console({level: !debugMode ? 'info' : 'debug', name: 'console'})
};

loggers.add('yt-dl-material', {
  level: 'info',
  format: format.combine(format.timestamp(), defaultFormat),
  defaultMeta: {},
  transports: [
    ts.error,
    ts.combined,
    ts.console
  ]
})



exports.logger = loggers.get('yt-dl-material');
exports.logger_transports = ts;
