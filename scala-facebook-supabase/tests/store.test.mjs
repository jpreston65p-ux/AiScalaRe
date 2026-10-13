import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {handleValue,types} from '../node_modules/postgres/src/types.js';
import {PgStore} from '../src/store.mjs';

test('el parámetro de la cola llega como array JSONB con el serializador real de Postgres.js',async()=>{
  // No connection or credentials: exercise the pinned driver's parameter
  // binding and JSONB serializer, including the empty-array failure case.
  const driver=postgres({prepare:false,max:1});
  const event={id:'900000000000001',post:'1369521966245025_900000000000002',at:Date.now(),author:'900000000000003',textHash:'a'.repeat(64)};
  try{
    for(const events of [[],[event]]){
      let encoded;
      const tx={json:driver.json,unsafe:async(query,values)=>{
        if(query.includes('jsonb_array_elements')){
          const parameters=[],oids=[];
          handleValue(values[1],parameters,oids,{transform:{}});
          // Server describes this bound parameter as JSONB (OID 3802).
          encoded=types.json.serialize(parameters[0]);
          assert.equal(oids[0],3802);
          const decoded=JSON.parse(encoded);
          assert.ok(Array.isArray(decoded),'JSONB must contain an array, not a serialized string');
          assert.deepEqual(decoded,events);
          return [{n:decoded.length}];
        }
        return query.includes('count(*)')?[{n:0}]:[];
      }};
      const store=new PgStore({begin:callback=>callback(tx)});
      await store.enqueue(events);
      assert.notEqual(encoded,undefined);
    }
  }finally{await driver.end();}
});
