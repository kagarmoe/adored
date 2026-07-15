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
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/collections/:id/items/:itemId/photos/:photoId/file",
          destination:
            "/api/collections/:id/items/:itemId/photos/:photoId",
        },
      ],
    };
  },
};

export default config;
