import postgres from 'postgres';
import {PgStore} from './src/store.mjs';
import {createService} from './src/worker.mjs';
declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')??'',{prepare:false,max:1,idle_timeout:5,connect_timeout:10});
const service=createService({store:new PgStore(sql)});
Deno.serve(request=>service.fetch(request,{waitUntil:(promise:Promise<unknown>)=>EdgeRuntime.waitUntil(promise)}));
