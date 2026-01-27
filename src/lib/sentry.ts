/**
 * Sentry Error Tracking Setup
 * 
 * Initialize Sentry for error tracking and monitoring.
 * Only initializes in production to avoid noise during development.
 */

import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT = import.meta.env.MODE || "development";

export function initSentry() {
  // Only initialize in production if DSN is provided
  if (!SENTRY_DSN || ENVIRONMENT === "development") {
    if (ENVIRONMENT === "development") {
      console.log("[Sentry] Disabled in development mode");
    } else {
      console.warn("[Sentry] DSN not configured - error tracking disabled");
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0, // 10% in prod, 100% in staging
    // Session Replay
    replaysSessionSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0, // Always record replays on errors
    // Filter out localhost and development errors
    beforeSend(event, hint) {
      // Don't send errors from localhost
      if (event.request?.url?.includes("localhost")) {
        return null;
      }
      return event;
    },
  });

  console.log("[Sentry] Initialized for error tracking");
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  if (context) {
    Sentry.setContext("additional", context);
  }
  Sentry.captureException(error);
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; username?: string } | null) {
  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb);
}
