/**
 * Configuration module for Lambda functions
 * Centralizes all environment variable access
 */

export interface DatabaseConfig {
  url: string;
}

export interface KafkaConfig {
  brokers: string[];
  username?: string;
  password?: string;
  ssl: boolean;
  saslMechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
}

export interface OutboxConfig {
  batchSize: number;
  maxRetries: number;
  retentionDays: number;
}

export interface PaymentProviderConfig {
  zalopay: {
    appId: string;
    key1: string;
    key2: string;
  };
  payos: {
    clientId: string;
    apiKey: string;
    checksumKey: string;
  };
  vnpay?: {
    tmnCode: string;
    hashSecret: string;
  };
}

export interface AppConfig {
  environment: string;
  logLevel: string;
  database: DatabaseConfig;
  kafka: KafkaConfig;
  outbox: OutboxConfig;
  paymentProviders: PaymentProviderConfig;
}

/**
 * Get required environment variable
 * @param key Environment variable name
 * @param defaultValue Optional default value
 * @returns Environment variable value
 * @throws Error if required variable is missing
 */
const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
};

/**
 * Get optional environment variable
 * @param key Environment variable name
 * @param defaultValue Default value if not set
 * @returns Environment variable value or default
 */
const getOptionalEnv = (key: string, defaultValue: string = ''): string => {
  return process.env[key] || defaultValue;
};

/**
 * Parse integer from environment variable
 * @param key Environment variable name
 * @param defaultValue Default value
 * @returns Parsed integer
 */
const getIntEnv = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Parse boolean from environment variable
 * @param key Environment variable name
 * @param defaultValue Default value
 * @returns Parsed boolean
 */
const getBoolEnv = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

/**
 * Load and validate configuration
 * @returns Application configuration
 */
export const loadConfig = (): AppConfig => {
  return {
    environment: getOptionalEnv('NODE_ENV', 'development'),
    logLevel: getOptionalEnv('LOG_LEVEL', 'info'),

    database: {
      url: getEnv('DATABASE_URL'),
    },

    kafka: {
      brokers: getEnv('KAFKA_BROKERS').split(',').map(b => b.trim()),
      username: getOptionalEnv('KAFKA_USERNAME'),
      password: getOptionalEnv('KAFKA_PASSWORD'),
      ssl: getBoolEnv('KAFKA_SSL', false),
      saslMechanism: (getOptionalEnv('KAFKA_SASL_MECHANISM', 'plain') as any),
    },

    outbox: {
      batchSize: getIntEnv('OUTBOX_BATCH_SIZE', 100),
      maxRetries: getIntEnv('OUTBOX_MAX_RETRIES', 5),
      retentionDays: getIntEnv('OUTBOX_RETENTION_DAYS', 7),
    },

    paymentProviders: {
      zalopay: {
        appId: getEnv('ZALOPAY_APP_ID'),
        key1: getEnv('ZALOPAY_KEY1'),
        key2: getEnv('ZALOPAY_KEY2'),
      },
      payos: {
        clientId: getEnv('PAYOS_CLIENT_ID'),
        apiKey: getEnv('PAYOS_API_KEY'),
        checksumKey: getEnv('PAYOS_CHECKSUM_KEY'),
      },
      vnpay: process.env.VNPAY_TMN_CODE ? {
        tmnCode: getEnv('VNPAY_TMN_CODE'),
        hashSecret: getEnv('VNPAY_HASH_SECRET'),
      } : undefined,
    },
  };
};

/**
 * Singleton config instance
 */
let config: AppConfig | null = null;

/**
 * Get application configuration
 * @returns Application configuration
 */
export const getConfig = (): AppConfig => {
  if (!config) {
    config = loadConfig();
  }
  return config;
};

/**
 * Reset config (useful for testing)
 */
export const resetConfig = (): void => {
  config = null;
};

export default getConfig;
