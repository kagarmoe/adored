/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Pin the workspace root: a stray lockfile in a parent dir (e.g. $HOME) makes
  // Turbopack infer the wrong root and read the wrong node_modules.
  turbopack: { root: import.meta.dirname },
  experimental: {
    // Every page here is dynamic and person-specific (a sort hub, a round, a
    // result), and a client navigation between them must show what just
    // happened. Next 14's default reuses a visited dynamic page's RSC payload
    // for 30s, so returning to the session hub after a round would render the
    // pre-round copy. The app used to paper over this with a round-end
    // router.refresh(), which raced the very navigation the person was making
    // (purses-hzwj); invalidate by not caching instead. This is Next 15's
    // default.
    staleTimes: { dynamic: 0 },
  },
  eslint: {
    // Linting runs as its own gate (`npm run lint`, a separate CI step). Next
    // 14's build-time lint runner passes legacy ESLint options (useEslintrc,
    // extensions) that ESLint 9's flat config rejects, so let the dedicated
    // step own linting and keep `next build` from choking on them.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.blob.vercel-storage.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default config;
