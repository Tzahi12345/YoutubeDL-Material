const winston = require('winston');

function normalizeLogLevel(logLevel) {
    if (!logLevel) return null;
    const normalized = String(logLevel).trim().toLowerCase();
    if (normalized === 'warning') return 'warn';
    return Object.prototype.hasOwnProperty.call(winston.config.npm.levels, normalized) ? normalized : null;
}

function resolveLogLevelFromEnv() {
    const raw_log_level = process.env.ytdl_log_level
        || process.env.YTDL_LOG_LEVEL
        || process.env.ytdl_logger_level
        || process.env.YTDL_LOGGER_LEVEL;

    const normalized_log_level = normalizeLogLevel(raw_log_level);
    if (normalized_log_level) {
        return {logLevel: normalized_log_level, invalidRawLogLevel: null};
    }

    if (raw_log_level) {
        return {logLevel: 'info', invalidRawLogLevel: raw_log_level};
    }

    const debugMode = process.env.YTDL_MODE === 'debug';
    return {logLevel: debugMode ? 'debug' : 'info', invalidRawLogLevel: null};
}

const {logLevel, invalidRawLogLevel} = resolveLogLevelFromEnv();

const defaultFormat = winston.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`;
});
const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(winston.format.timestamp(), defaultFormat),
    defaultMeta: {},
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log`
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'appdata/logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'appdata/logs/combined.log' }),
      new winston.transports.Console({level: logLevel, name: 'console'})
    ]
});

if (invalidRawLogLevel) {
    logger.warn(`Invalid log level '${invalidRawLogLevel}' from environment. Falling back to 'info'.`);
}

module.exports = logger;
