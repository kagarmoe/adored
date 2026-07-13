/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Pin the workspace root: a stray lockfile in a parent dir (e.g. $HOME) makes
  // Turbopack infer the wrong root and read the wrong node_modules.
  turbopack: { root: import.meta.dirname },
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
