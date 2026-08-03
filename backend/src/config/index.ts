import dotenv from 'dotenv';

dotenv.config();

export const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true;
  if (origin.startsWith('http://localhost:')) return true;
  if (origin.endsWith('.netlify.app')) return true;
  if (origin === 'https://tempora-v2.netlify.app') return true;

  if (process.env.CORS_ORIGIN) {
    const allowed = process.env.CORS_ORIGIN.split(',').map((s) => s.trim());
    if (allowed.includes(origin) || allowed.includes('*')) return true;
  }

  return true;
};

export const config = {
  PORT: process.env.PORT || 3001,
  CORS_ORIGIN: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  NODE_ENV: process.env.NODE_ENV || 'development',
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || '',
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || '',
  CHAT_ENCRYPTION_KEY: process.env.CHAT_ENCRYPTION_KEY || 'tempora_v2_master_encryption_key_32bytes_default_2026',
};
