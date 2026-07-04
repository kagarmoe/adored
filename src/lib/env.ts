import { z } from "zod";

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // Auth base URL + secret — Vercel provides these as AUTH_URL / AUTH_SECRET.
  // They are the fallback source for BETTER_AUTH_URL / BETTER_AUTH_SECRET
  // (see auth-server.ts), so a single secret can serve better-auth.
  AUTH_URL: z.string().url("AUTH_URL must be a valid URL"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  // better-auth overrides. All optional so the app boots before these are set:
  // BETTER_AUTH_SECRET/URL fall back to AUTH_SECRET/AUTH_URL in auth-server.ts,
  // and Google creds default to empty (provider registered but inert until the
  // user supplies real values).
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Email (optional in development)
  // Sender must be a Resend-verified domain. kimberlygarmoe.com is verified;
  // a subdomain (adored.kimberlygarmoe.com) would need its own verification.
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email").default("noreply@kimberlygarmoe.com"),
  EMAIL_SERVER_HOST: z.string().default("localhost"),
  EMAIL_SERVER_PORT: z.coerce.number().default(1025),
  EMAIL_SERVER_USER: z.string().optional(),
  EMAIL_SERVER_PASSWORD: z.string().optional(),
  // Resend API key — optional so a missing key is valid (email.ts no-ops the
  // send rather than throwing). Set in the deploy env for real sends.
  RESEND_API_KEY: z.string().optional(),

  // Vercel Blob (optional, auto-configured in Vercel)
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

type EnvConfig = z.infer<typeof envSchema>;

let envConfig: EnvConfig | null = null;

function validateEnv(): EnvConfig {
  if (envConfig) return envConfig;

  const env = process.env;

  // Preview deployments don't get an explicit AUTH_URL (each has a unique,
  // ephemeral hostname). Vercel injects VERCEL_URL per deploy (hostname only,
  // no scheme), so derive AUTH_URL from it as a fallback. An explicit AUTH_URL
  // (Production, or a branch override) always wins.
  const resolvedAuthUrl =
    env.AUTH_URL ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined);

  try {
    envConfig = envSchema.parse({
      NODE_ENV: env.NODE_ENV,
      DATABASE_URL: env.DATABASE_URL,
      AUTH_URL: resolvedAuthUrl,
      AUTH_SECRET: env.AUTH_SECRET,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      EMAIL_FROM: env.EMAIL_FROM,
      EMAIL_SERVER_HOST: env.EMAIL_SERVER_HOST,
      EMAIL_SERVER_PORT: env.EMAIL_SERVER_PORT,
      EMAIL_SERVER_USER: env.EMAIL_SERVER_USER,
      EMAIL_SERVER_PASSWORD: env.EMAIL_SERVER_PASSWORD,
      RESEND_API_KEY: env.RESEND_API_KEY,
      BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
    });

    // Guard against the #62 footgun: VERCEL=1 (e.g. dumped into .env.local by
    // `vercel env pull`) makes better-auth write Secure cookies, but an http
    // AUTH_URL means the browser drops them — auth silently breaks (every
    // request bounces to /login). On real Vercel both are consistent (https);
    // locally they contradict. Warn loudly rather than fail, since the app
    // still starts.
    if (process.env.VERCEL && envConfig.AUTH_URL.startsWith("http://")) {
      console.warn(
        "[env] WARNING: VERCEL is set but AUTH_URL is http:// — better-auth " +
          "will write Secure cookies the browser drops over http, breaking " +
          "auth (redirects to /login). Remove VERCEL from your local env (do " +
          "not keep Vercel system vars in .env.local).",
      );
    }

    return envConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(`Environment validation failed:\n${missingVars}`);
    }
    throw error;
  }
}

export const env = new Proxy({} as EnvConfig, {
  get: (_target, prop: string | symbol) => {
    const config = validateEnv();
    return config[prop as keyof EnvConfig];
  },
}) as EnvConfig;

// Validate on module load in production
if (typeof window === "undefined" && process.env.NODE_ENV === "production") {
  validateEnv();
}
