import "dotenv/config";
import { defineConfig } from "prisma/config";

// `env("DATABASE_URL")` from `prisma/config` validates resolution at
// config-load time — which crashes `prisma generate` in CI even though
// codegen does not need a real connection. Use process.env directly with
// an empty-string fallback so the config loads anywhere. Runtime callers
// (lib/db.ts -> PrismaClient -> Neon) still read process.env.DATABASE_URL
// and behave identically; Vercel + .env.local supply the real Neon URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
