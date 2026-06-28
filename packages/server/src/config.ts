import { z } from "zod";

/**
 * Environment configuration, validated once at startup with Zod.
 * Fail fast and loud if anything required is missing or malformed.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // HTTP
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  /** Public base URL the browser reaches this app at (used for OAuth redirect). */
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),

  // Paths (inside the container these are the mounted volumes)
  HUB_PATH: z.string().default("/data/sync"),
  DATA_DIR: z.string().default("/data/app"),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  /** 32-byte key (base64 or hex) used to encrypt refresh tokens at rest. */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(16, "TOKEN_ENCRYPTION_KEY must be set to a strong secret"),

  // Engine defaults (overridable at runtime via settings)
  POLL_INTERVAL_MS: z.coerce.number().int().min(2000).default(7000),
  CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  DELETE_PROPAGATION: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  oauthRedirectUri: string;
};

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const data = parsed.data;
  cached = {
    ...data,
    oauthRedirectUri: new URL(
      "/api/auth/google/callback",
      data.PUBLIC_URL,
    ).toString(),
  };
  return cached;
}

/** For tests: reset the cached config so a fresh env can be loaded. */
export function resetConfigForTests(): void {
  cached = null;
}
