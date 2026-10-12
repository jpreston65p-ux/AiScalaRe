import {createHash} from 'node:crypto';

export const cloudTarget=Object.freeze({project:'86dc9c33-9042-48a9-8201-b94e04232179',environment:'7da2eda3-0a63-4bb2-9b2f-d606f18a3987',service:'1ff3639b-084e-48d6-a8fa-be50be6c3075',owner:'61576458508649',variable:'SCALA_FACEBOOK_SESSION_B64'});

export function validateSessionPacket(packet,ownerId,now=Date.now()){
  if(!packet || packet.version!==1 || packet.browser!=='firefox' || packet.ownerId!==ownerId || !/^\d{5,20}$/.test(ownerId)
    || !Number.isFinite(packet.createdAt) || packet.createdAt<1 || packet.createdAt>now+60000 || !Array.isArray(packet.cookies) || !packet.cookies.length || packet.cookies.length>100)throw new Error('invalid_cloud_session');
  const seen=new Set();
  const cookies=packet.cookies.map(cookie=>{
    if(!cookie || typeof cookie.name!=='string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(cookie.name) || typeof cookie.value!=='string' || cookie.value.length>4096 || /[\x00-\x1f\x7f]/.test(cookie.value)
      || typeof cookie.domain!=='string' || !/^\.?([a-z0-9-]+\.)*facebook\.com$/.test(cookie.domain) || typeof cookie.path!=='string' || !cookie.path.startsWith('/') || cookie.path.length>256 || /[\x00-\x1f\x7f]/.test(cookie.path)
      || typeof cookie.secure!=='boolean' || typeof cookie.httpOnly!=='boolean' || !['Strict','Lax','None'].includes(cookie.sameSite) || !Number.isFinite(cookie.expires) || cookie.expires!==-1 && cookie.expires<=now/1000)throw new Error('invalid_cloud_session');
    const key=cookie.domain+'|'+cookie.path+'|'+cookie.name;
    if(seen.has(key))throw new Error('invalid_cloud_session');seen.add(key);
    return {name:cookie.name,value:cookie.value,domain:cookie.domain,path:cookie.path,expires:cookie.expires,httpOnly:cookie.httpOnly,secure:cookie.secure,sameSite:cookie.sameSite};
  });
  const account=cookies.find(cookie=>cookie.name==='c_user' && cookie.secure && /^\d{5,20}$/.test(cookie.value));
  if(!account || !cookies.some(cookie=>cookie.name==='xs' && cookie.secure && cookie.value.length))throw new Error('invalid_cloud_session');
  // c_user may identify the administrator of an additional profile. Actual
  // Scala Fe identity is always checked through /me/ before any reply.
  return {version:1,browser:'firefox',ownerId,createdAt:packet.createdAt,cookies};
}

export function encodeSessionPacket(packet,ownerId,now=Date.now()){
  const raw=JSON.stringify(validateSessionPacket(packet,ownerId,now));
  if(Buffer.byteLength(raw)>65536)throw new Error('invalid_cloud_session');
  return Buffer.from(raw).toString('base64');
}

export function decodeSessionPacket(encoded,ownerId,now=Date.now()){
  if(typeof encoded!=='string' || !encoded || encoded.length>87384 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded))throw new Error('invalid_cloud_session');
  try{
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.toString('base64')!==encoded || bytes.length>65536)throw new Error();
    const packet=JSON.parse(bytes.toString('utf8'));
    if(!Number.isFinite(packet?.createdAt) || packet.createdAt>now+60000)throw new Error();
    // Short-lived optional cookies can expire after an authorized upload.
    // Validate the packet at creation, then retain only currently live cookies.
    const valid=validateSessionPacket(packet,ownerId,packet.createdAt);
    valid.cookies=valid.cookies.filter(cookie=>cookie.expires===-1 || cookie.expires>now/1000);
    return validateSessionPacket(valid,ownerId,now);
  }catch{throw new Error('invalid_cloud_session');}
}

export function sessionDigest(encoded){return createHash('sha256').update(encoded).digest('hex');}

