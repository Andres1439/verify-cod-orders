// app/utils/logger.server.ts

interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

const LOG_LEVELS: LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatMessage(level: string, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta && { meta }),
    };

    if (this.isProduction) {
      return JSON.stringify(logEntry);
    }

    return `[${timestamp}] ${level.toUpperCase()}: ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
  }

  error(message: string, meta?: any) {
    console.error(this.formatMessage(LOG_LEVELS.ERROR, message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage(LOG_LEVELS.WARN, message, meta));
  }

  info(message: string, meta?: any) {

  }

  debug(message: string, meta?: any) {
    if (this.isDevelopment) {

    }
  }

  // Método específico para webhooks
  webhook(topic: string, shop: string, status: 'success' | 'error' | 'received', details?: any) {
    this.info(`Webhook ${topic} for ${shop}`, {
      topic,
      shop,
      status,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    });
  }

  // Método específico para órdenes
  order(action: string, shop: string, orderId: string | undefined, status: 'success' | 'error', details?: any) {
    this.info(`Order ${action} for ${shop}`, {
      action,
      shop,
      orderId,
      status,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    });
  }
}

export const logger = new Logger(); 