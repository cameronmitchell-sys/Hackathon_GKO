import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === 'development'
const isProd = process.env.NODE_ENV === 'production'

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Add custom tags
      initialScope: {
        tags: {
          runtime: 'nodejs',
          app_name: 'SentryOS',
          app_version: process.env.npm_package_version || '1.0.0',
        },
      },

      // Adjust sample rates based on environment
      tracesSampleRate: isProd ? 0.1 : 1.0,
      profilesSampleRate: isProd ? 0.1 : 1.0,

      // Redact sensitive data
      beforeSend(event) {
        // Redact API keys, tokens, and other sensitive data
        if (event.request?.headers) {
          const headers = event.request.headers as Record<string, unknown>
          delete headers['authorization']
          delete headers['x-api-key']
        }
        if (event.contexts?.request?.headers) {
          const headers = event.contexts.request.headers as Record<string, unknown>
          delete headers['authorization']
          delete headers['x-api-key']
        }
        // Redact environment variables
        if (event.contexts?.runtime?.env) {
          const env = event.contexts.runtime.env as Record<string, unknown>
          Object.keys(env).forEach(key => {
            if (key.toLowerCase().includes('key') ||
                key.toLowerCase().includes('token') ||
                key.toLowerCase().includes('secret')) {
              env[key] = '[REDACTED]'
            }
          })
        }
        return event
      },

      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Add custom tags
      initialScope: {
        tags: {
          runtime: 'edge',
          app_name: 'SentryOS',
          app_version: process.env.npm_package_version || '1.0.0',
        },
      },

      // Adjust sample rates based on environment
      tracesSampleRate: isProd ? 0.1 : 1.0,
      profilesSampleRate: isProd ? 0.1 : 1.0,

      // Redact sensitive data
      beforeSend(event) {
        // Redact API keys, tokens, and other sensitive data
        if (event.request?.headers) {
          const headers = event.request.headers as Record<string, unknown>
          delete headers['authorization']
          delete headers['x-api-key']
        }
        if (event.contexts?.request?.headers) {
          const headers = event.contexts.request.headers as Record<string, unknown>
          delete headers['authorization']
          delete headers['x-api-key']
        }
        return event
      },

      debug: false,
    });
  }
}
