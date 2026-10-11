import { loadConfig } from './config.mjs';
const { config } = loadConfig({ live: false });
await import(config.mode === 'comments' ? './comments-index.mjs' : './index.mjs');
