const names=/^(Comentar|Comentarios|Ver comentarios|Mostrar comentarios)$/;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function isCommentPanelControl(element,selectors){
  if(element.closest('form,[role="form"]') || element.getAttribute('type')==='submit'
    || element.closest(selectors.commentRows+', '+selectors.replyRows))return false;
  // Playwright serializes this function: its pattern must stay local.
  return /^(Comentar|Comentarios|Ver comentarios|Mostrar comentarios)$/.test((element.getAttribute('aria-label') || element.textContent || '').trim());
}

export function panelClickReason(error){
  const message=String(error?.message || '');
  if(/intercepts pointer events|does not receive pointer events/.test(message))return 'covered';
  if(/outside of the viewport/.test(message))return 'outside_viewport';
  if(/not stable/.test(message))return 'moving';
  if(/not visible/.test(message))return 'hidden';
  if(/not enabled/.test(message))return 'disabled';
  if(/not attached|detached/.test(message))return 'detached';
  return error?.name==='TimeoutError' ? 'timeout' : 'unavailable';
}

async function visible(locator){
  const result=[];
  for(const item of await locator.all())if(await item.isVisible())result.push(item);
  return result;
}

export async function ensureCommentPanel(page,selectors,{stage=()=>{},log=()=>{},pageName='Scala Fe',timeout=45000,discoveryMs=15000}={}){
  const started=Date.now(),identity=page.locator(selectors.identity);
  const find=async()=>{
    const expected=await visible(identity);
    const editors=await visible(page.locator('[contenteditable]:not([contenteditable="false"]),textarea'));
    const controls=[];
    for(const button of await visible(page.getByRole('button',{name:names})))
      if(await button.evaluate(isCommentPanelControl,selectors))controls.push(button);
    return {expected,editors,controls};
  };
  let ui;
  do{
    ui=await find();
    if(ui.expected.length || ui.editors.length || ui.controls.length || Date.now()-started>=discoveryMs)break;
    await pause(150);
  }while(true);
  if(ui.expected.length)return;
  const inventory=async()=>page.evaluate(name=>{
    const visible=element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return rect.width>0 && rect.height>0 && style.visibility!=='hidden' && style.display!=='none';};
    return [...document.querySelectorAll('[contenteditable],[role="textbox"],[role="combobox"],textarea,input:not([type="hidden"])')].filter(visible).slice(0,20).map(element=>({
      tag:element.tagName,role:element.getAttribute('role'),editable:element.getAttribute('contenteditable'),type:element.getAttribute('type'),
      labelledForScala:element.getAttribute('aria-label')==='Comentar como '+name
    }));
  },pageName);
  // Counts only: no editor labels, customer content, URLs or credentials.
  log({expectedComposer:ui.expected.length,visibleEditors:ui.editors.length,commentControls:ui.controls.length});
  let action='wait',control;
  try{
    if(!ui.editors.length && ui.controls.length===1){
      action='open';control=ui.controls[0];
      stage('abrir_panel_comentarios');
      await control.click({timeout:15000});
    }else if(!ui.editors.length && ui.controls.length>1)throw new Error('selectors_not_calibrated');
    // Never click a generic Comentar control if any draft/editor is visible.
    action='wait';stage('esperar_campo_comentar');
    await identity.waitFor({state:'visible',timeout:Math.max(1,timeout-(Date.now()-started))});
  }
  catch(error){
    let editors=[],geometry=null;
    try{if(page.evaluate)editors=await inventory();}catch{}
    try{if(control)geometry=await control.evaluate(element=>{
      const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      const inViewport=x>=0 && y>=0 && x<innerWidth && y<innerHeight;
      const hit=inViewport ? document.elementFromPoint(x,y) : null;
      return {tag:element.tagName,role:element.getAttribute('role'),inViewport,
        withinDialog:!!element.closest('[role="dialog"]'),blocked:!!hit && !element.contains(hit) && !hit.contains(element),
        blockerTag:hit?.tagName || null,blockerRole:hit?.getAttribute('role') || null};
    });}catch{}
    try{ui=await find();}catch{}
    log({expectedComposer:ui.expected.length,visibleEditors:ui.editors.length,commentControls:ui.controls.length,
      action,reason:panelClickReason(error),editors,geometry});
    throw error;
  }
}
