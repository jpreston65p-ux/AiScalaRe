import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogFor } from './catalog.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function facebookUrl(value) {
  try { const url = new URL(value); if (url.protocol === 'https:' && ['www.facebook.com', 'facebook.com', 'business.facebook.com'].includes(url.hostname) && !url.username && !url.password) return url.href; } catch {}
  throw new Error('invalid_facebook_url');
}
export function facebookPostUrl(value, ownerId) {
  const url = new URL(facebookUrl(value));
  if (!['facebook.com', 'www.facebook.com'].includes(url.hostname)) throw new Error('invalid_post_url');
  const post = /^\/([^/]+)\/posts\/[a-z0-9]+\/?$/i.exec(url.pathname);
  if (/^\/reel\/\d+\/?$/.test(url.pathname) || post && !['groups','events','stories','share','marketplace','settings','messages'].includes(post[1].toLowerCase())) return 'https://www.facebook.com' + url.pathname.replace(/\/?$/, '/');
  if (url.pathname === '/permalink.php' && url.searchParams.get('id') === ownerId && /^[a-z0-9]+$/i.test(url.searchParams.get('story_fbid') || '')) {
    return `https://www.facebook.com/permalink.php?story_fbid=${url.searchParams.get('story_fbid')}&id=${ownerId}`;
  }
  throw new Error('invalid_post_url');
}
export function validateConfig(config) {
  if (!config || config.verifiedPage !== true || !config.pageUrl || config.mode !== 'comments' && !config.inboxUrl) throw new Error('page_not_verified');
  if (config.mode != null && !['comments','messenger'].includes(config.mode)) throw new Error('invalid_config');
  if (config.allowSending !== true) throw new Error('sending_not_enabled');
  if (config.mode === 'comments') return validateCommentConfig(config);
  const selectors = config.selectors;
  const required = ['identity', 'threads', 'activeThread', 'messages', 'incoming', 'outgoing', 'messageText', 'messageTime', 'composer', 'send'];
  if (!selectors || required.some(key => typeof selectors[key] !== 'string' || !selectors[key].trim() || selectors[key].length > 500) || !['datetime', 'data-timestamp'].includes(selectors.timeAttribute)) throw new Error('selectors_not_calibrated');
  if (!['seconds', 'milliseconds', 'iso'].includes(selectors.timeFormat) || !Number.isInteger(config.pollSeconds) || config.pollSeconds < 5 || config.pollSeconds > 60 || !Number.isInteger(config.dailyLimit) || config.dailyLimit < 1 || config.dailyLimit > 10000 || typeof config.pageName !== 'string' || !config.pageName.trim()) throw new Error('invalid_config');
  return { ...config, pageUrl: facebookUrl(config.pageUrl), inboxUrl: facebookUrl(config.inboxUrl) };
}
function validateCommentConfig(config) {
  const c = config.comments, s = c?.selectors;
  const required = ['identity','postScope','postAuthor','commentRows','commentAuthor','commentText','commentTime','replyRows'];
  if (!s || required.some(key => typeof s[key] !== 'string' || !s[key].trim() || s[key].length > 500)
    || s.timeAttribute !== 'aria-label' || s.timeFormat !== 'spanish-civil') throw new Error('selectors_not_calibrated');
  if (typeof c.timeZone !== 'string' || !c.timeZone.trim()) throw new Error('invalid_config');
  try { new Intl.DateTimeFormat('es', { timeZone:c.timeZone }).format(); } catch { throw new Error('invalid_config'); }
  if (!/^\d{5,20}$/.test(c.ownerId) || c.monitor !== 'notifications' || !Array.isArray(c.postUrls) || !c.postUrls.length
    || !Number.isInteger(config.pollSeconds) || config.pollSeconds < 2 || config.pollSeconds > 30
    || !Number.isInteger(c.notificationRefreshSeconds) || c.notificationRefreshSeconds < 5 || c.notificationRefreshSeconds > 300
    || !Number.isInteger(c.maxCommentAgeSeconds) || c.maxCommentAgeSeconds < 300 || c.maxCommentAgeSeconds > 86400
    || !Number.isInteger(config.dailyLimit) || config.dailyLimit < 1 || config.dailyLimit > 1000 || typeof config.pageName !== 'string' || !config.pageName.trim()) throw new Error('invalid_config');
  const pageUrl = new URL(facebookUrl(config.pageUrl));
  if (!['facebook.com','www.facebook.com'].includes(pageUrl.hostname)
    || !(new RegExp('^/p/[^/]+-' + c.ownerId + '/$').test(pageUrl.pathname) || pageUrl.pathname === '/profile.php' && pageUrl.searchParams.get('id') === c.ownerId)) throw new Error('invalid_profile_url');
  return { ...config, pageUrl: pageUrl.href, comments: { ...c, postUrls: c.postUrls.map(url => facebookPostUrl(url, c.ownerId)) } };
}
export function loadConfig({ live = true } = {}) {
  const raw = JSON.parse(readFileSync(resolve(root, 'facebook.config.json'), 'utf8'));
  return { config: live ? validateConfig(raw) : raw, catalog: catalogFor({ WHATSAPP_CATALOG_JSON: readFileSync(resolve(root, 'catalogo.json'), 'utf8') }), dataDir: process.env.SCALA_FACEBOOK_DATA_DIR ? resolve(process.env.SCALA_FACEBOOK_DATA_DIR) : resolve(root, 'data') };
}
