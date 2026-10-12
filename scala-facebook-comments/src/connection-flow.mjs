import {facebookUrl} from './config.mjs';

// Only profile URLs, never the id= parameter of a post or a notification.
export function facebookProfileId(value) {
  try {
    const url=new URL(facebookUrl(value));
    if(!['facebook.com','www.facebook.com'].includes(url.hostname))return null;
    const id=url.pathname==='/profile.php' ? url.searchParams.get('id')
      : /(?:^\/p\/[^/]+-|^\/people\/[^/]+\/)(\d+)\/?$/.exec(url.pathname)?.[1];
    return /^\d{5,20}$/.test(id || '') ? id : null;
  }catch{return null;}
}

const messages={
  desktop_required:'La conexión inicial necesita la terminal y el escritorio de Linux Mint.',
  invalid_arguments:'Para conectar la nube usa: bash CONECTAR_SCALA_FACEBOOK.sh --nube',
  invalid_cloud_session:'No se pudo preparar una sesión propia válida para la nube. No se enviaron credenciales.',
  railway_login_required:'Falta completar el inicio de sesión en Railway con la cuenta de SCALA.',
  cloud_upload_failed:'Railway no aceptó la sesión para el servicio de Facebook.',
  firefox_content_sandbox_unverified:'No se pudo verificar el aislamiento de Firefox en este equipo. La conexión no se activó.',
  sandbox_disabled_by_environment:'Una variable del equipo desactiva el aislamiento de Firefox. La conexión no se activó.',
  already_running:'Detén el otro proceso del bot antes de conectar esta sesión.',
  sign_in_required:'Falta iniciar sesión en la ventana de Firefox del programa.',
  facebook_verification_required:'Facebook pide una comprobación. Complétala en su ventana y después reintenta.',
  profile_not_open:'Abre el perfil de Scala Fe en este Firefox antes de pulsar Enter. No se navegará a /me/.',
  browser_closed:'Firefox se cerró. El programa lo abrirá de nuevo antes del siguiente intento.',
  page_identity_changed:'La cuenta o el campo para comentar no coincide con Scala Fe. No se activaron envíos.',
  post_owner_changed:'No se pudo verificar la publicación de Scala Fe.',
  selectors_not_calibrated:'Facebook muestra controles distintos a los verificados. No se activaron envíos.',
  notification_view_changed:'No se pudo verificar la pantalla de avisos.',
  unreliable_timestamp:'Facebook mostró una fecha distinta del formato esperado.',
  comment_identity_unknown:'No se pudo identificar el enlace del comentario.',
  comment_author_unknown:'No se pudo verificar el autor del comentario.',
  replies_not_loaded:'Facebook no terminó de cargar las respuestas.',
  non_root_linux_required:'Ejecuta la conexión como farm, sin sudo.'
};

export function connectionErrorInfo(error) {
  const known=Object.hasOwn(messages,error?.message || '');
  const code=known ? error.message : ({TimeoutError:'tiempo_de_espera_agotado',TypeError:'tipo_de_dato_inesperado'}[error?.name] || 'error_no_clasificado');
  return {code,message:known ? messages[error.message] : 'No se completó la comprobación. Puedes corregir la pantalla y reintentar.'};
}

// A categorical diagnostic only: no browser URLs, content, cookies or names.
export function connectionPageState(page,ownerId) {
  if(!page || page.isClosed())return 'ventana_cerrada';
  try {
    const value=page.url(),url=new URL(facebookUrl(value));
    if(/^\/(login|recover)(\/|\.php|$)/.test(url.pathname))return 'inicio_de_sesion';
    if(/^\/(checkpoint|two_step_verification|authentication)(\/|$)/.test(url.pathname))return 'comprobacion_de_facebook';
    const profile=facebookProfileId(value);
    if(profile)return profile===ownerId ? 'perfil_scala' : 'otro_perfil';
    if(url.pathname==='/notifications/')return 'avisos';
    if(/\/reel\/|\/posts\/|\/permalink\.php$/.test(url.pathname))return 'publicacion';
    return 'otra_pantalla_de_facebook';
  }catch{return 'pantalla_sin_facebook';}
}

// No cleanup occurs inside this loop. The caller closes its browser only
// after success, explicit SALIR, Ctrl+C or a fatal failure outside the wizard.
export async function waitForConnection({prepare,question,check,onError}) {
  let retry=false;
  while(true) {
    let ready=true;
    try{await prepare();}catch(error){ready=false;retry=true;await onError(error);}
    const answer=await question(retry
      ? 'Corrige la pantalla de Firefox y pulsa Enter para reintentar; escribe SALIR para cerrar: '
      : 'Cuando veas el perfil de Scala Fe, pulsa Enter para comprobarlo; SALIR para cerrar: ');
    if(/^(salir|exit|q)$/i.test(answer.trim()))return false;
    if(!ready)continue;
    try{await check();return true;}catch(error){retry=true;await onError(error);}
  }
}
