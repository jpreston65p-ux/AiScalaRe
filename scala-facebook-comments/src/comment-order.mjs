const orderNames=/^(Más relevantes|Más recientes|Todos los comentarios)(?:\s|$)/;
const selectedNames=/^(Más recientes|Todos los comentarios)(?:\s|$)/;
const popupRoles='[role="menu"], [role="listbox"]';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function orderButtons(scope,selectors) {
  const found=[];
  for(const button of await scope.getByRole('button',{name:orderNames}).all()) {
    if(!await button.isVisible())continue;
    // A customer's name/link/text cannot impersonate a sorting control.
    if(await button.evaluate((element,s)=>{
      if(element.closest(s.commentRows+', '+s.replyRows))return true;
      for(let parent=element.parentElement;parent;parent=parent.parentElement){
        const role=parent.getAttribute('role');
        if(role==='menu' || role==='listbox')return true;
        if(role==='dialog' && !parent.querySelector(s.identity+', '+s.commentRows+', '+s.replyRows))return true;
      }
      return false;
    },selectors))continue;
    found.push(button);
  }
  return found;
}

async function menuOptions(page,selectors) {
  // Prefer actual menus/listboxes and support a separate small dialog.
  // Never treat the post/comment dialog as a sorting menu.
  for(const roles of [popupRoles,'[role="dialog"]']) {
    const choices=[];
    for(const container of await page.locator(roles).all()) {
      if(!await container.isVisible())continue;
      if(await container.locator(selectors.identity+', '+selectors.commentRows+', '+selectors.replyRows).count())continue;
      if(await container.locator(popupRoles).count())continue;
      for(const name of ['Más recientes','Todos los comentarios']) {
        for(const option of await container.getByText(name,{exact:true}).all()) {
          if(await option.isVisible())choices.push({name,option});
        }
      }
    }
    if(choices.length)return choices;
  }
  return [];
}

async function until(check,timeout) {
  const expires=Date.now()+timeout;
  while(true) {
    const result=await check();
    if(result)return result;
    if(Date.now()>=expires)return null;
    await pause(Math.min(150,Math.max(0,expires-Date.now())));
  }
}

export async function selectCommentOrder(page,scope,selectors,{stage=()=>{},timeout=10000}={}) {
  stage('comprobar_orden_comentarios');
  const buttons=await orderButtons(scope,selectors);
  if(buttons.length>1)throw new Error('selectors_not_calibrated');
  if(!buttons.length)return;
  const label=((await buttons[0].getAttribute('aria-label')) || await buttons[0].innerText()).trim();
  if(selectedNames.test(label))return;
  // A failed attempt may have left the correct popup open. Do not toggle
  // it closed or reload the post on a retry.
  let choices=await menuOptions(page,selectors);
  if(!choices.length) {
    stage('abrir_menu_comentarios');
    await buttons[0].click({timeout:15000});
    stage('esperar_menu_comentarios');
    choices=await until(async()=>{
      const options=await menuOptions(page,selectors);return options.length ? options : null;
    },timeout);
  }
  if(!choices?.length)throw new Error('comment_order_not_available');
  const preferred=choices.filter(choice=>choice.name==='Más recientes');
  const candidates=preferred.length ? preferred : choices.filter(choice=>choice.name==='Todos los comentarios');
  if(candidates.length!==1)throw new Error('selectors_not_calibrated');
  stage('seleccionar_orden_comentarios');
  await candidates[0].option.click({timeout:15000});
  stage('confirmar_orden_comentarios');
  const confirmed=await until(async()=>{
    const current=await orderButtons(scope,selectors);
    if(current.length!==1)return false;
    const name=((await current[0].getAttribute('aria-label')) || await current[0].innerText()).trim();
    return name.startsWith(candidates[0].name);
  },timeout);
  if(!confirmed)throw new Error('comment_order_unconfirmed');
}
