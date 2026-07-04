/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
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
