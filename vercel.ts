import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  installCommand: "npm install",

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
