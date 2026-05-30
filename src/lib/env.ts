import { z } from "zod";

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // NextAuth
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),

  // Email (optional in development)
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email").default("noreply@purseinator.app"),
  EMAIL_SERVER_HOST: z.string().default("localhost"),
  EMAIL_SERVER_PORT: z.coerce.number().default(1025),
  EMAIL_SERVER_USER: z.string().optional(),
  EMAIL_SERVER_PASSWORD: z.string().optional(),

  // Vercel Blob (optional, auto-configured in Vercel)
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

type EnvConfig = z.infer<typeof envSchema>;

let envConfig: EnvConfig | null = null;

function validateEnv(): EnvConfig {
  if (envConfig) return envConfig;

  const env = process.env;

  try {
    envConfig = envSchema.parse({
      NODE_ENV: env.NODE_ENV,
      DATABASE_URL: env.DATABASE_URL,
      NEXTAUTH_URL: env.NEXTAUTH_URL,
      NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
      EMAIL_FROM: env.EMAIL_FROM,
      EMAIL_SERVER_HOST: env.EMAIL_SERVER_HOST,
      EMAIL_SERVER_PORT: env.EMAIL_SERVER_PORT,
      EMAIL_SERVER_USER: env.EMAIL_SERVER_USER,
      EMAIL_SERVER_PASSWORD: env.EMAIL_SERVER_PASSWORD,
      BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
    });

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
  get: (target, prop) => {
    const config = validateEnv();
    return config[prop as keyof EnvConfig];
  },
});

// Validate on module load in production
if (typeof window === "undefined" && process.env.NODE_ENV === "production") {
  validateEnv();
}
