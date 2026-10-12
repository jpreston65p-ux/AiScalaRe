import test from 'node:test';
import assert from 'node:assert/strict';
import {isPlaybackRequest,isReelImageRequest,reduceCloudPlayback} from '../src/cloud-playback.mjs';

const request=(url,type='fetch',method='GET',navigation=false)=>({
  url:()=>url,resourceType:()=>type,method:()=>method,isNavigationRequest:()=>navigation
});

test('los vídeos de reproducción y sus segmentos se omiten sin leer cabeceras ni cuerpos',()=>{
  assert.equal(isPlaybackRequest(request('https://video.xx.fbcdn.net/reel.mp4?valor_privado=ficticio')),true);
  assert.equal(isPlaybackRequest(request('https://video.xx.fbcdn.net/chunk.m4s')),true);
  assert.equal(isPlaybackRequest(request('https://example.invalid/audio','media')),true);
});

test('las solicitudes de cuenta, interfaz, controles y envíos siguen intactas',()=>{
  for(const item of [request('https://www.facebook.com/checkpoint/','document','GET',true),
    request('https://www.facebook.com/api/graphql/','xhr','POST'),
    request('https://static.xx.fbcdn.net/app.js','script'),
    request('https://static.xx.fbcdn.net/avatar.jpg','image'),
    request('https://video.xx.fbcdn.net/file.mp4','fetch','POST'),
    request('https://www.facebook.com/profile.php?id=61576458508649','document','GET',true),
    request('https://fbcdn.net.ejemplo.invalid/file.mp4'),request('https://example.invalid/file.mp4')])
    assert.equal(isPlaybackRequest(item),false);
});

test('el filtro solo aborta medios y continúa el resto sin registrarlos',async()=>{
  let handler;const calls=[];
  await reduceCloudPlayback({route:async(pattern,fn)=>{assert.equal(pattern,'**/*');handler=fn;}});
  const route=req=>({request:()=>req,abort:reason=>calls.push(['abort',reason]),continue:()=>calls.push(['continue'])});
  await handler(route(request('https://video.xx.fbcdn.net/video.mp4')));
  await handler(route(request('https://www.facebook.com/api/graphql/','xhr','POST')));
  assert.deepEqual(calls,[['abort','blockedbyclient'],['continue']]);
});

test('las imágenes del carrusel se omiten sin bloquear imágenes de acceso o verificación',()=>{
  const image=request('https://scontent.xx.fbcdn.net/poster.jpg','image');
  for(const frame of ['https://www.facebook.com/checkpoint/','https://www.facebook.com/login/',
    'https://www.facebook.com/profile.php?id=61576458508649','https://www.facebook.com.ejemplo.invalid/reel/1079349435002481/']){
    image.frame=()=>({url:()=>frame});assert.equal(isReelImageRequest(image),false);
  }
  image.frame=()=>({url:()=> 'https://www.facebook.com/reel/1079349435002481/'});
  assert.equal(isReelImageRequest(image),true);
  const foreign={...image,url:()=> 'https://example.invalid/poster.jpg'};assert.equal(isReelImageRequest(foreign),false);
});
