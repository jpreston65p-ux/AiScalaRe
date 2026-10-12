import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {cloudStartupDeadline} from '../src/cloud-startup.mjs';

test('un arranque atascado detiene el grupo propio completo y termina de liberarlo tras el plazo de cierre',async()=>{
  const signals=[];let disabled=false;
  const cancel=cloudStartupDeadline({pid:12345},{timeout:10,graceMs:10,onTimeout:()=>{disabled=true;},kill:(...args)=>signals.push(args)});
  await pause(60);
  assert.equal(cancel(),false);
  assert.equal(disabled,true);assert.deepEqual(signals,[[-12345,'SIGTERM'],[-12345,'SIGKILL']]);
});

test('un trabajador verificado o finalizado cancela el plazo sin detener su navegador',async()=>{
  const signals=[];
  const cancel=cloudStartupDeadline({pid:12345},{timeout:10,graceMs:10,onTimeout:()=>assert.fail('no debe expirar'),kill:(...args)=>signals.push(args)});
  assert.equal(cancel(),true);await pause(40);assert.deepEqual(signals,[]);
});

test('el cierre nunca admite el grupo del propio servidor ni un identificador inexistente',()=>{
  for(const pid of [undefined,0,1,-12345])assert.throws(()=>cloudStartupDeadline({pid}),/invalid_worker_process/);
});
