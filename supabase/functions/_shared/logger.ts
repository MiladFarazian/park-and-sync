/**
 * Supabase Edge Functions Logger
 * ==============================
 *
 * Structured logging for edge functions with consistent formatting.
 * All logs go to Supabase's function logs which can be viewed in the dashboard.
 *
 * ## Usage
 * ```typescript
 * import { logger } from '../_shared/logger.ts';
 *
 * const log = logger.scope('create-booking');
 * log.info('Processing booking request', { spotId, userId });
 * log.error('Payment failed', { error: error.message, bookingId });
 * ```
 *
 * ## Log Levels
 * - debug: Detailed debugging (consider removing in production)
 * - info: Normal operations
 * - warn: Potential issues
 * - error: Actual errors
 *
 * ## Security Guidelines
 * - Never log full tokens, passwords, or API keys
 * - Truncate sensitive IDs (show first 8 chars only)
 * - Never log full card numbers or PII
 * - Log operation context, not raw user input
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

// Check if we should include debug logs
const isDebugEnabled = Deno.env.get('LOG_LEVEL') === 'debug';

class EdgeLogger {
  private scope: string;

  constructor(scope: string = 'function') {
    this.scope = scope;
  }

  private formatMessage(level: LogLevel, message: string, data?: LogData): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.scope}]`;

    if (data && Object.keys(data).length > 0) {
      // Sanitize sensitive fields
      const sanitized = this.sanitizeData(data);
      return `${prefix} ${message} ${JSON.stringify(sanitized)}`;
    }

    return `${prefix} ${message}`;
  }

  private sanitizeData(data: LogData): LogData {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'authorization',
      'credit_card', 'card_number', 'cvv', 'ssn', 'access_token'
    ];

    const result: LogData = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Check if this is a sensitive field
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        result[key] = '[REDACTED]';
        continue;
      }

      // Truncate long strings that might be tokens
      if (typeof value === 'string' && value.length > 100) {
        result[key] = `${value.substring(0, 20)}...[truncated]`;
        continue;
      }

      // Truncate IDs to first 8 characters for privacy
      if (typeof value === 'string' && lowerKey.includes('id') && value.length === 36) {
        result[key] = `${value.substring(0, 8)}...`;
        continue;
      }

      // Handle errors
      if (value instanceof Error) {
        result[key] = { message: value.message, name: value.name };
        continue;
      }

      result[key] = value;
    }

    return result;
  }

  debug(message: string, data?: LogData): void {
    if (isDebugEnabled) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: LogData): void {
    console.log(this.formatMessage('info', message, data));
  }

  warn(message: string, data?: LogData): void {
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message: string, data?: LogData): void {
    console.error(this.formatMessage('error', message, data));
  }

  /**
   * Create a scoped logger for a specific function
   */
  createScope(name: string): EdgeLogger {
    return new EdgeLogger(name);
  }

  /**
   * Alias for createScope
   */
  scope(name: string): EdgeLogger {
    return this.createScope(name);
  }

  /**
   * Time an operation
   */
  time(label: string): { end: () => void } {
    const start = performance.now();
    return {
      end: () => {
        const duration = Math.round(performance.now() - start);
        this.info(`${label} completed`, { durationMs: duration });
      },
    };
  }
}

// Export singleton
export const logger = new EdgeLogger();

// Export class for custom instances
export { EdgeLogger };
