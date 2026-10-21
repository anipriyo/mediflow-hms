import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  dbPath: process.env.MEDIFLOW_DB || path.join(ROOT_DIR, 'data', 'mediflow.db'),
  jwtSecret: process.env.JWT_SECRET || 'mediflow-dev-secret-change-in-production',
  tokenTtlHours: 8,
  lockout: { maxAttempts: 5, lockMinutes: 15 },
  clientDist: path.join(ROOT_DIR, 'client', 'dist'),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
};
