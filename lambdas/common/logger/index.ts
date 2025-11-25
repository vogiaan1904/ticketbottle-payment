import winston from 'winston';

/**
 * Configure Winston logger for Lambda
 * CloudWatch automatically captures stdout/stderr
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'payment-lambda',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

/**
 * Log an error with structured data
 * @param message Error message
 * @param error Error object
 * @param meta Additional metadata
 */
export const logError = (message: string, error: Error, meta?: Record<string, any>): void => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...meta,
  });
};

/**
 * Log a warning with structured data
 * @param message Warning message
 * @param meta Additional metadata
 */
export const logWarn = (message: string, meta?: Record<string, any>): void => {
  logger.warn(message, meta);
};

/**
 * Log info with structured data
 * @param message Info message
 * @param meta Additional metadata
 */
export const logInfo = (message: string, meta?: Record<string, any>): void => {
  logger.info(message, meta);
};

/**
 * Log debug information
 * @param message Debug message
 * @param meta Additional metadata
 */
export const logDebug = (message: string, meta?: Record<string, any>): void => {
  logger.debug(message, meta);
};

export default logger;
