import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudTarget,encodeSessionPacket,decodeSessionPacket} from '../src/cloud-session.mjs';
import {uploadSession} from '../src/cloud-upload.mjs';
import {sandboxProcess,protectedFirefoxContent} from '../src/browser-sandbox.mjs';
import {cloudBrowserHeadless} from '../src/browser-runtime.mjs';

test('el servidor respeta la pantalla virtual y rechaza modos de navegador desconocidos',()=>{
  assert.equal(cloudBrowserHeadless({}),true);
  assert.equal(cloudBrowserHeadless({SCALA_FACEBOOK_HEADLESS:'0'}),false);
  assert.equal(cloudBrowserHeadless({SCALA_FACEBOOK_HEADLESS:'1'}),true);
  assert.throws(()=>cloudBrowserHeadless({SCALA_FACEBOOK_HEADLESS:'false'}),/invalid_cloud_browser_mode/);
});

const now=Date.parse('2026-10-12T01:00:00Z');
const cookie=(name,value)=>({name,value,domain:'.facebook.com',path:'/',expires:now/1000+86400,httpOnly:name==='xs',secure:true,sameSite:'Lax'});
const packet=()=>({version:1,browser:'firefox',ownerId:cloudTarget.owner,createdAt:now,cookies:[cookie('c_user','123456789'),cookie('xs','VALOR_FICTICIO_DE_PRUEBA') ]});

test('una sesión propia admite un administrador distinto del perfil adicional, pero conserva el dueño exacto de SCALA',()=>{
  const encoded=encodeSessionPacket(packet(),cloudTarget.owner,now);
  const decoded=decodeSessionPacket(encoded,cloudTarget.owner,now);
  assert.equal(decoded.ownerId,cloudTarget.owner);assert.equal(decoded.cookies[0].value,'123456789');
  assert.throws(()=>decodeSessionPacket(encoded,'999999999',now),/invalid_cloud_session/);
});

test('no se transmiten credenciales ajenas a Facebook, vencidas o inseguras',()=>{
  for(const change of [c=>c.domain='facebook.com.ejemplo.invalid',c=>c.expires=now/1000-1,c=>c.secure=false,c=>c.value='dato\ninyectado']){
    const changed=packet();change(changed.cookies[1]);assert.throws(()=>encodeSessionPacket(changed,cloudTarget.owner,now),/invalid_cloud_session/);
  }
  const changed=packet();changed.cookies.push({...changed.cookies[0]});assert.throws(()=>encodeSessionPacket(changed,cloudTarget.owner,now),/invalid_cloud_session/);
  assert.throws(()=>decodeSessionPacket('no es un paquete',cloudTarget.owner,now),/invalid_cloud_session/);
});

test('la sesión va solo por stdin al servicio exacto de Facebook y no aparece en argumentos ni salida',()=>{
  const fresh=packet();fresh.createdAt=Date.now();fresh.cookies.forEach(c=>c.expires=Date.now()/1000+86400);
  const encoded=encodeSessionPacket(fresh,cloudTarget.owner),calls=[];
  uploadSession(encoded,{tty:false,run:(command,args,options)=>{calls.push({command,args,options});return {status:0,stdout:encoded,stderr:encoded};}});
  assert.equal(calls.length,2);
  const upload=calls[1];assert.equal(upload.options.input,encoded);assert.equal(upload.options.stdio[0],'pipe');
  assert.ok(upload.args.includes('--stdin'));assert.ok(upload.args.includes(cloudTarget.variable));
  for(const id of [cloudTarget.project,cloudTarget.environment,cloudTarget.service])assert.ok(upload.args.includes(id));
  assert.ok(calls.every(call=>!call.args.some(value=>value.includes(encoded))));
  assert.equal(upload.args.includes('--skip-deploys'),false);
});

test('no hay envío a Railway si falta completar el acceso autorizado',()=>{
  const fresh=packet();fresh.createdAt=Date.now();fresh.cookies.forEach(c=>c.expires=Date.now()/1000+86400);
  let calls=0;assert.throws(()=>uploadSession(encodeSessionPacket(fresh,cloudTarget.owner),{tty:false,run:()=>{calls++;return {status:1};}}),/railway_login_required/);
  assert.equal(calls,1);
});

const parent={pid:100,parent:1,name:'node',uid:1000,seccomp:2,filters:1,noNewPrivileges:0};
const browser={...parent,pid:101,parent:100,name:'firefox'};
const content={...parent,pid:102,parent:101,name:'Web Content',noNewPrivileges:1,filters:2};

test('el aislamiento del contenedor por sí solo no se confunde con el aislamiento del contenido de Firefox',()=>{
  assert.equal(protectedFirefoxContent([parent,browser,content],100,1000).length,1);
  for(const change of [{filters:1},{noNewPrivileges:0},{seccomp:0},{parent:999},{uid:0},{name:'firefox'}])assert.equal(protectedFirefoxContent([parent,browser,{...content,...change}],100,1000).length,0);
});

test('la lectura del estado del kernel distingue usuario efectivo, filtros y privilegios',()=>{
  const parsed=sandboxProcess('Name:\tWeb Content\nPid:\t102\nPPid:\t101\nUid:\t1000\t1000\t1000\t1000\nNoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t2\n');
  assert.equal(parsed.uid,1000);assert.equal(parsed.filters,2);assert.equal(parsed.noNewPrivileges,1);
  assert.equal(protectedFirefoxContent([parent,browser,parsed],100,1000).length,1);
});
