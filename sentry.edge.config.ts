// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryEnvironment =
  process.env.VERCEL_ENV ||
  (process.env.NODE_ENV === "production"
    ? "local-production"
    : "local-development");

const sentryEnabled =
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_ENV === "preview";

Sentry.init({
  dsn: "https://dd69e757e59f3a76301d609d1dbf5307@o4511940078141440.ingest.de.sentry.io/4511940085874768",

  enabled: sentryEnabled,
  environment: sentryEnvironment,

  // Runtime observability is sent only from Vercel deployments.
  tracesSampleRate:
    sentryEnabled
      ? 0.05
      : 0,

  enableLogs: sentryEnabled,
  sendDefaultPii: false,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

