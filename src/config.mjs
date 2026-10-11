import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogFor } from './catalog.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function loadConfig(env = process.env) {
  const file = resolve(projectRoot, env.SCALA_CATALOG_FILE || 'catalogo.json');
  const catalog = catalogFor({ WHATSAPP_CATALOG_JSON: readFileSync(file, 'utf8') });
  const dailyLimit = Number(env.SCALA_DAILY_LIMIT || 1000);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000) throw new Error('invalid_limit');
  return { catalog, dailyLimit, dataDir: resolve(projectRoot, env.SCALA_DATA_DIR || 'data') };
}
