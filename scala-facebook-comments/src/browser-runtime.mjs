import {chromium,firefox} from 'playwright';
import {verifyFirefoxSandbox} from './browser-sandbox.mjs';

export function commentsBrowserName(){
  const name=process.env.SCALA_FACEBOOK_BROWSER || 'chromium';
  if(!['chromium','firefox'].includes(name))throw new Error('invalid_browser');
  return name;
}

export function cloudBrowserHeadless(env=process.env){
  const mode=env.SCALA_FACEBOOK_HEADLESS ?? '1';
  if(!['0','1'].includes(mode))throw new Error('invalid_cloud_browser_mode');
  return mode==='1';
}

export const firefoxProtection={
  'security.sandbox.warn_unprivileged_namespaces':true,
  'security.fileuri.strict_origin_policy':true,
  'dom.filesystem.pathcheck.disabled':false,
  'dom.file.createInChild':false,
  'fission.webContentIsolationStrategy':1,
  'browser.safebrowsing.malware.enabled':true,
  'browser.safebrowsing.phishing.enabled':true,
  'browser.safebrowsing.blockedURIs.enabled':true,
  'dom.security.https_first':true
};

export async function launchCommentsContext(profile,config,{headless=false}={}){
  const name=commentsBrowserName();
  if(name==='firefox' && ['MOZ_DISABLE_CONTENT_SANDBOX','MOZ_DISABLE_GMP_SANDBOX','MOZ_DISABLE_RDD_SANDBOX','MOZ_DISABLE_SOCKET_PROCESS_SANDBOX'].some(key=>process.env[key] && process.env[key]!=='0'))throw new Error('sandbox_disabled_by_environment');
  const options={headless,acceptDownloads:false,timezoneId:config.comments.timeZone,locale:'es-BO'};
  const context=await (name==='firefox'?firefox.launchPersistentContext(profile,{...options,firefoxUserPrefs:firefoxProtection}):chromium.launchPersistentContext(profile,{...options,chromiumSandbox:true}));
  try{
    if(name==='firefox'){
      const page=await context.newPage();
      await page.goto('data:text/html,'+encodeURIComponent('<!doctype html><title>SCALA</title><p>Comprobación del navegador de SCALA</p>'),{waitUntil:'domcontentloaded',timeout:30000});
      await verifyFirefoxSandbox();
      await page.close();
    }
    return context;
  }catch(error){await context.close();throw error;}
}
