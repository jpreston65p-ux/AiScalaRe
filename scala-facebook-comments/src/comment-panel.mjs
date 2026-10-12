const names=/^(Comentar|Comentarios|Ver comentarios|Mostrar comentarios)$/;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function isCommentPanelControl(element,selectors){
  if(element.closest('form,[role="form"]') || element.getAttribute('type')==='submit'
    || element.closest(selectors.commentRows+', '+selectors.replyRows))return false;
  return names.test((element.getAttribute('aria-label') || element.textContent || '').trim());
}

async function visible(locator){
  const result=[];
  for(const item of await locator.all())if(await item.isVisible())result.push(item);
  return result;
}

export async function ensureCommentPanel(page,selectors,{stage=()=>{},log=()=>{},timeout=45000,discoveryMs=15000}={}){
  const started=Date.now(),identity=page.locator(selectors.identity);
  const find=async()=>{
    const expected=await visible(identity);
    const editors=await visible(page.locator('[contenteditable="true"][role="textbox"],textarea'));
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
  // Counts only: no editor labels, customer content, URLs or credentials.
  log({expectedComposer:ui.expected.length,visibleEditors:ui.editors.length,commentControls:ui.controls.length});
  if(!ui.editors.length && ui.controls.length===1){
    stage('abrir_panel_comentarios');
    await ui.controls[0].click({timeout:15000});
  }else if(!ui.editors.length && ui.controls.length>1)throw new Error('selectors_not_calibrated');
  // Never click a generic Comentar control if any draft/editor is visible.
  stage('esperar_campo_comentar');
  try{await identity.waitFor({state:'visible',timeout:Math.max(1,timeout-(Date.now()-started))});}
  catch(error){
    ui=await find();log({expectedComposer:ui.expected.length,visibleEditors:ui.editors.length,commentControls:ui.controls.length});
    throw error;
  }
}
