# Sentry Setup Guide

This project is configured with Sentry for error tracking and performance monitoring.

## Setup Steps

### 1. Create a Sentry Project

1. Go to [sentry.io](https://sentry.io) and sign in (or create an account)
2. Create a new project and select "Next.js" as the platform
3. Note your DSN (Data Source Name) from the project settings

### 2. Configure Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Then update the following variables in `.env.local`:

```env
SENTRY_DSN=your-sentry-dsn-here
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=your-sentry-project
```

### 3. Optional: Set Up Source Maps Upload

To upload source maps for better error tracking:

1. Create a Sentry auth token at https://sentry.io/settings/account/api/auth-tokens/
2. Add it to `.env.local`:
   ```env
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

## What's Configured

- **Instrumentation**: Sentry is initialized via `src/instrumentation.ts` using Next.js instrumentation hook
- **Error Tracking**: Automatic error capture in both client and server environments
- **Performance Monitoring**: Trace sample rate set to 100% (adjust for production)
- **Source Maps**: Configured to hide source maps from client bundles while uploading to Sentry
- **Tunneling**: Browser requests are routed through `/monitoring` to circumvent ad-blockers

## Testing Sentry

To test that Sentry is working:

1. Start the development server: `pnpm dev`
2. Visit your app
3. Trigger an error (you can add a test error in your code)
4. Check your Sentry dashboard for the error report

## Production Considerations

- Adjust `tracesSampleRate` in `src/instrumentation.ts` (recommended: 0.1 or 10%)
- Set `debug: false` in production
- Ensure `SENTRY_AUTH_TOKEN` is set in your CI/CD environment for source map uploads

## Documentation

- [Sentry Next.js SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Configuration Options](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
