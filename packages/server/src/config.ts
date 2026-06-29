import { z } from "zod";

/**
 * Environment configuration, validated once at startup with Zod.
 * In v2 the only hard requirement is an encryption key; cloud credentials are
 * optional and only needed for the backends you actually use.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // HTTP
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  /** Public URL the browser reaches this app at (used for OAuth redirects). */
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),

  // Paths (mounted volumes inside the container)
  DATA_DIR: z.string().default("/data/app"),
  /** Default local folder, offered as a convenience "Local" remote. */
  HUB_PATH: z.string().default("/data/sync"),

  /** Required: encrypts remote credentials + tokens at rest (AES-256-GCM). */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(16, "TOKEN_ENCRYPTION_KEY must be set to a strong secret"),

  // Optional: only needed to connect Google Drive via one-click OAuth.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /** Path to the rclone binary (defaults to "rclone" on PATH). */
  RCLONE_BIN: z.string().optional(),

  CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  oauthRedirectUri: string;
  googleConfigured: boolean;
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
    oauthRedirectUri: new URL("/api/oauth/google/callback", data.PUBLIC_URL).toString(),
    googleConfigured: Boolean(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET),
  };
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}
