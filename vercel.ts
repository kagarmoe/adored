import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  installCommand: "npm install",

  // Environment variables configuration
  env: {
    // Database - users must set in Vercel project settings
    DATABASE_URL: "@database_url",
    // NextAuth - generate and set in Vercel project settings
    NEXTAUTH_SECRET: "@nextauth_secret",
    NEXTAUTH_URL: "@nextauth_url",
    // Email - default for development, override in production
    EMAIL_FROM: "noreply@purseinator.app",
    EMAIL_SERVER_HOST: "@email_server_host",
    EMAIL_SERVER_PORT: "@email_server_port",
    // Optional SMTP auth for production
    EMAIL_SERVER_USER: "@email_server_user",
    EMAIL_SERVER_PASSWORD: "@email_server_password",
  },

  // Rewrites for API routes (all handled by Next.js)
  rewrites: [],

  // Redirects for legacy routes
  redirects: [],

  // Cache control headers for static assets
  headers: [
    routes.cacheControl("/static/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
    routes.cacheControl("/_next/static/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
  ],

  // Optional: Scheduled cron jobs (requires Pro plan)
  // crons: [
  //   { path: '/api/cron/cleanup-sessions', schedule: '0 2 * * *' }
  // ]
};
