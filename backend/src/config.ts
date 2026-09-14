import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4030),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Public base URL used in hosted links and status URLs, e.g. https://pay.example.com */
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4030"),
  DATABASE_URL: z.string().optional(),
  STELLAR_NETWORK: z.enum(["testnet", "mainnet", "custom"]).default("testnet"),
  STELLAR_NETWORK_PASSPHRASE: z.string().optional(),
  STELLAR_HORIZON_URL: z.string().url().optional(),
  /** Stellar CLI-style secret is NOT accepted here. Provide the signing key via REQPAY_SIGNING_SEED only in secure environments. */
  REQPAY_SIGNING_SEED: z
    .string()
    .regex(/^S[A-Z2-7]{55}$/)
    .optional(),
  MERCHANT_NAME: z.string().max(120).optional(),
  MERCHANT_DOMAIN: z.string().max(253).optional(),
  /** Default request lifetime in seconds when the client omits expires_at. */
  DEFAULT_EXPIRY_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(30 * 86_400)
    .default(900),
  /** Poll Horizon for incoming payments (seconds); 0 disables the watcher. */
  WATCH_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(0),
  CORS_ORIGINS: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;
export interface AppConfig extends Env {
  networkPassphrase: string;
  horizonUrl?: string;
}

const PRESETS = {
  testnet: {
    passphrase: "Test SDF Network ; September 2015",
    horizon: "https://horizon-testnet.stellar.org",
  },
  mainnet: {
    passphrase: "Public Global Stellar Network ; September 2015",
    horizon: "https://horizon.stellar.org",
  },
} as const;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success)
    throw new Error(
      `invalid configuration for: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const env = parsed.data;
  const preset = env.STELLAR_NETWORK === "custom" ? undefined : PRESETS[env.STELLAR_NETWORK];
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE ?? preset?.passphrase;
  if (!networkPassphrase)
    throw new Error("STELLAR_NETWORK_PASSPHRASE is required when STELLAR_NETWORK=custom");
  const horizonUrl = env.STELLAR_HORIZON_URL ?? preset?.horizon;
  return { ...env, networkPassphrase, ...(horizonUrl ? { horizonUrl } : {}) };
}
