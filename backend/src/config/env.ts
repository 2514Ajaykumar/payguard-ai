import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend directory or root directory if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export type StorageDriver = 'in_memory' | 'postgres';

export interface EnvConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string | string[];
  paypalClientId: string;
  paypalClientSecret: string;
  paypalBaseUrl: string;
  frontendUrl: string;
  isPayPalConfigured: boolean;
  groqApiKey: string;
  groqModel: string;
  groqBaseUrl: string;
  isGroqConfigured: boolean;
  tavilyApiKey: string;
  isTavilyConfigured: boolean;
  storageDriver: StorageDriver;
  databaseUrl?: string;
  isPostgresConfigured: boolean;
}

const parsePort = (val: string | undefined, defaultVal: number): number => {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

const parseStorageDriver = (val: string | undefined): StorageDriver => {
  const normalized = (val || 'in_memory').trim().toLowerCase();
  if (normalized === 'postgres' || normalized === 'postgresql') {
    return 'postgres';
  }
  if (normalized === 'in_memory' || normalized === 'memory') {
    return 'in_memory';
  }
  throw new Error(
    `Invalid STORAGE_DRIVER: "${val}". Supported drivers are "in_memory" and "postgres".`
  );
};

const parseCorsOrigins = (corsOriginVal?: string, frontendUrlVal?: string): string[] => {
  const origins = new Set<string>();

  if (corsOriginVal) {
    corsOriginVal
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  if (frontendUrlVal) {
    const cleaned = frontendUrlVal.trim().replace(/\/+$/, '');
    if (cleaned) origins.add(cleaned);
  }

  if (origins.size === 0) {
    origins.add('http://localhost:5173');
  }

  return Array.from(origins);
};

const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
const baseUrl = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').trim().replace(/\/+$/, '');
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
const groqApiKey = (process.env.GROQ_API_KEY || '').trim();
const groqModel = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
const groqBaseUrl = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
const tavilyApiKey = (process.env.TAVILY_API_KEY || '').trim();

const storageDriver = parseStorageDriver(process.env.STORAGE_DRIVER);
const databaseUrl = (process.env.DATABASE_URL || '').trim();

// Security check: Never silently fall back to in-memory if PostgreSQL is explicitly requested
if (storageDriver === 'postgres' && !databaseUrl) {
  throw new Error(
    'STORAGE_DRIVER is set to "postgres", but DATABASE_URL is missing or empty. Please provide a valid PostgreSQL connection string or use STORAGE_DRIVER=in_memory.'
  );
}

export const config: EnvConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT, 5000),
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN, frontendUrl),
  paypalClientId: clientId,
  paypalClientSecret: clientSecret,
  paypalBaseUrl: baseUrl,
  frontendUrl,
  isPayPalConfigured: Boolean(clientId && clientSecret && clientId !== 'your_sandbox_client_id'),
  groqApiKey,
  groqModel,
  groqBaseUrl,
  isGroqConfigured: Boolean(groqApiKey && !groqApiKey.includes('your_groq_api_key')),
  tavilyApiKey,
  isTavilyConfigured: Boolean(tavilyApiKey && !tavilyApiKey.includes('your_tavily_api_key')),
  storageDriver,
  databaseUrl: databaseUrl || undefined,
  isPostgresConfigured: Boolean(
    databaseUrl &&
      !databaseUrl.includes('your_postgresql_connection_string') &&
      (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))
  ),
};

/**
 * Returns safe environment configuration for logging and health checks,
 * strictly stripping any secrets, passwords, or tokens.
 */
export const getSafeConfig = () => ({
  nodeEnv: config.nodeEnv,
  port: config.port,
  storage: {
    driver: config.storageDriver,
    postgresConfigured: config.isPostgresConfigured,
  },
  paypal: {
    configured: config.isPayPalConfigured,
    baseUrl: config.paypalBaseUrl,
    mode: 'sandbox',
    clientIdPrefix: config.paypalClientId ? `${config.paypalClientId.slice(0, 6)}...` : 'not_set',
  },
  groq: {
    configured: config.isGroqConfigured,
    model: config.groqModel,
    keyPrefix: config.groqApiKey ? `${config.groqApiKey.slice(0, 6)}...` : 'not_set',
  },
  tavily: {
    configured: config.isTavilyConfigured,
    keyPrefix: config.tavilyApiKey ? `${config.tavilyApiKey.slice(0, 6)}...` : 'not_set',
  },
  frontendUrl: config.frontendUrl,
});
