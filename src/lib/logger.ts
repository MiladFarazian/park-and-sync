/**
 * Parkzy Logging Strategy
 * =======================
 *
 * This module provides environment-aware logging that:
 * - Outputs detailed logs in development for debugging
 * - Silences most logs in production to reduce noise and protect sensitive data
 * - Always logs errors (they indicate real problems)
 * - Provides structured logging with consistent formatting
 *
 * ## Log Levels
 * - `debug`: Verbose debugging info (dev only) - cache hits, API calls, state changes
 * - `info`: General information (dev only) - user actions, navigation, successful operations
 * - `warn`: Warnings (always) - deprecated usage, potential issues, recoverable errors
 * - `error`: Errors (always) - exceptions, failed operations, unexpected states
 *
 * ## Usage
 * ```typescript
 * import { logger } from '@/lib/logger';
 *
 * // Basic logging
 * logger.debug('Cache hit for key:', key);
 * logger.info('User logged in');
 * logger.warn('Deprecated API called');
 * logger.error('Failed to fetch data:', error);
 *
 * // Scoped logging for components/features
 * const log = logger.scope('Booking');
 * log.debug('Creating booking hold');
 * log.info('Booking confirmed:', bookingId);
 * log.error('Payment failed:', error);
 *
 * // Timing operations
 * const timer = logger.time('fetchSpots');
 * await fetchSpots();
 * timer.end(); // Logs: "[fetchSpots] 234ms"
 * ```
 *
 * ## Guidelines
 * 1. Use `debug` for verbose info useful during development
 * 2. Use `info` for significant user actions and state changes
 * 3. Use `warn` for issues that don't break functionality
 * 4. Use `error` for actual errors that need attention
 * 5. Never log sensitive data (passwords, tokens, full card numbers, PII)
 * 6. Use scoped loggers for easier filtering in console
 * 7. Prefer structured data over string concatenation
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  showTimestamp: boolean;
  showScope: boolean;
}

// Log level priority (lower = more verbose)
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Detect environment
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

// Default configuration based on environment
const defaultConfig: LoggerConfig = {
  enabled: true,
  minLevel: isDevelopment ? 'debug' : 'warn', // Only warn/error in production
  showTimestamp: isDevelopment,
  showScope: true,
};

// Color schemes for different log levels (only in dev)
const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #9ca3af', // gray
  info: 'color: #3b82f6',  // blue
  warn: 'color: #f59e0b',  // amber
  error: 'color: #ef4444', // red
};

const SCOPE_STYLE = 'color: #8b5cf6; font-weight: bold'; // purple

class Logger {
  private config: LoggerConfig;
  private scope?: string;

  constructor(config: Partial<LoggerConfig> = {}, scope?: string) {
    this.config = { ...defaultConfig, ...config };
    this.scope = scope;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  private formatMessage(level: LogLevel, args: unknown[]): unknown[] {
    const parts: unknown[] = [];

    // In development, add styled prefix
    if (isDevelopment) {
      const timestamp = this.config.showTimestamp
        ? `[${new Date().toLocaleTimeString()}]`
        : '';
      const scopePrefix = this.scope && this.config.showScope
        ? `[${this.scope}]`
        : '';
      const levelPrefix = `[${level.toUpperCase()}]`;

      if (this.scope) {
        parts.push(
          `%c${timestamp}%c${scopePrefix}%c${levelPrefix}`,
          'color: #6b7280',
          SCOPE_STYLE,
          LEVEL_STYLES[level]
        );
      } else {
        parts.push(
          `%c${timestamp}${levelPrefix}`,
          LEVEL_STYLES[level]
        );
      }
    } else {
      // In production, simple prefix (no styles)
      const prefix = this.scope ? `[${this.scope}]` : '';
      if (prefix) parts.push(prefix);
    }

    return [...parts, ...args];
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(...this.formatMessage('debug', args));
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(...this.formatMessage('info', args));
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage('warn', args));
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage('error', args));
    }
  }

  /**
   * Create a scoped logger for a specific component or feature
   */
  createScope(scopeName: string): Logger {
    const newScope = this.scope ? `${this.scope}:${scopeName}` : scopeName;
    return new Logger(this.config, newScope);
  }

  /**
   * Alias for createScope - more concise syntax
   */
  scope(scopeName: string): Logger {
    return this.createScope(scopeName);
  }

  /**
   * Time an operation and log the duration
   */
  time(label: string): { end: () => void } {
    const start = performance.now();
    return {
      end: () => {
        const duration = Math.round(performance.now() - start);
        this.debug(`[${label}] ${duration}ms`);
      },
    };
  }

  /**
   * Log a group of related messages (collapsible in dev tools)
   */
  group(label: string, fn: () => void): void {
    if (!this.shouldLog('debug')) {
      fn();
      return;
    }

    if (isDevelopment) {
      console.groupCollapsed(`%c[${this.scope || 'Logger'}] ${label}`, SCOPE_STYLE);
      fn();
      console.groupEnd();
    } else {
      fn();
    }
  }

  /**
   * Log structured data as a table (dev only)
   */
  table(data: unknown[], columns?: string[]): void {
    if (this.shouldLog('debug') && isDevelopment) {
      if (columns) {
        console.table(data, columns);
      } else {
        console.table(data);
      }
    }
  }
}

// Export a singleton instance for general use
export const logger = new Logger();

// Export the class for creating custom instances
export { Logger };

// Convenience exports for scoped loggers
export const createLogger = (scope: string) => logger.scope(scope);

// Pre-configured loggers for common areas
export const authLogger = logger.scope('Auth');
export const bookingLogger = logger.scope('Booking');
export const mapLogger = logger.scope('Map');
export const paymentLogger = logger.scope('Payment');
export const apiLogger = logger.scope('API');
