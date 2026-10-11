import {createServer} from 'node:http';
import {chromium,firefox} from 'playwright';

process.umask(0o077);
let state='comprobando_navegador';
const server=createServer((request,response)=>{
  if(request.method!=='GET' || request.url!=='/health'){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  response.end(JSON.stringify({proyecto:'SCALA Facebook',estado:state,respuestasAutomaticas:false}));
});
server.listen(Number(process.env.PORT || 8080),'0.0.0.0');
let browser;
try{
  const engine=process.env.SCALA_FACEBOOK_BROWSER==='firefox'?'firefox':'chromium';
  browser=await (engine==='firefox'?firefox.launch({headless:true}):chromium.launch({headless:true,chromiumSandbox:true}));
  const page=await browser.newPage({locale:'es-BO',timezoneId:'America/La_Paz'});
  await page.setContent('<!doctype html><title>SCALA</title><p>Comprobación de SCALA</p>');
  if(await page.locator('p').innerText()!=='Comprobación de SCALA')throw new Error('browser_probe_failed');
  if(engine==='firefox'){
    await page.goto('about:support',{waitUntil:'domcontentloaded'});
    const table=page.locator('#sandbox-tbody');
    await table.locator('th[data-l10n-id="effective-content-sandbox-level"]').waitFor({timeout:15000});
    const values=await table.evaluate(element=>Object.fromEntries(Array.from(element.querySelectorAll('tr')).map(row=>[row.querySelector('th')?.getAttribute('data-l10n-id'),row.querySelector('td')?.textContent?.trim()])));
    const level=Number(values['effective-content-sandbox-level']);
    if(values['has-seccomp-bpf']!=='true' || values['can-sandbox-content']!=='true' || !Number.isInteger(level) || level<4)throw new Error('firefox_content_sandbox_unverified');
    console.log('SCALA_FIREFOX_SANDBOX: '+JSON.stringify({seccomp:true,content:true,effectiveLevel:level,userNamespaces:values['has-user-namespaces']}));
  }
  state='listo_para_vincular';
  console.log('SCALA_BROWSER_CHECK_OK: '+engine+' con aislamiento funciona. La sesión de Facebook sigue pendiente.');
}catch(error){
  state='navegador_no_disponible';
  console.log('SCALA_BROWSER_CHECK_FAILED: no se activó Facebook ni se desactivó el aislamiento del navegador.');
  // This probe has no credentials, visits only owned static HTML and never
  // reads the ChatGPT browser. The launch error helps diagnose this host.
  console.error(error.message.slice(0,10000));
}finally{
  if(browser){try{await browser.close();}catch{}}
}
const stop=()=>server.close(()=>process.exit(0));
process.once('SIGINT',stop);process.once('SIGTERM',stop);
