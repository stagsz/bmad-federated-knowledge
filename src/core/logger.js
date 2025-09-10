const winston = require('winston');
const path = require('path');

/**
 * Logger utility for BMAD Federated Knowledge System
 * Provides structured logging with different levels and formats
 */
class Logger {
  constructor(level = 'info', options = {}) {
    this.options = {
      logDir: './logs',
      maxFiles: 5,
      maxSize: '20m',
      ...options
    };

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'bmad-federated-knowledge' },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              let log = `${timestamp} [${level}]: ${message}`;
              if (Object.keys(meta).length > 0) {
                log += ` ${JSON.stringify(meta)}`;
              }
              return log;
            })
          )
        }),

        // File transport for all logs
        new winston.transports.File({
          filename: path.join(this.options.logDir, 'combined.log'),
          maxsize: this.options.maxSize,
          maxFiles: this.options.maxFiles
        }),

        // File transport for errors only
        new winston.transports.File({
          filename: path.join(this.options.logDir, 'error.log'),
          level: 'error',
          maxsize: this.options.maxSize,
          maxFiles: this.options.maxFiles
        })
      ]
    });
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or metadata
   */
  error(message, error = {}) {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, error);
    }
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * Log verbose message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  verbose(message, meta = {}) {
    this.logger.verbose(message, meta);
  }

  /**
   * Set log level
   * @param {string} level - Log level
   */
  setLevel(level) {
    this.logger.level = level;
  }

  /**
   * Get current log level
   * @returns {string} Current log level
   */
  getLevel() {
    return this.logger.level;
  }
}

module.exports = { Logger };