import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';

export function sqliteAuth(store) {
  const parse = text => JSON.parse(text, BufferJSON.reviver);
  const serialize = value => JSON.stringify(value, BufferJSON.replacer);
  const saved = store.authGet('credentials', 'main');
  const creds = saved ? parse(saved) : initAuthCreds();
  const saveCreds = () => store.authSet('credentials', 'main', serialize(creds));
  saveCreds();
  return {
    state: {
      creds,
      keys: {
        async get(type, ids) {
          const result = {};
          for (const id of ids) {
            const raw = store.authGet(type, id);
            if (!raw) continue;
            let value = parse(raw);
            if (type === 'app-state-sync-key') value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }
          return result;
        },
        async set(data) {
          store.transaction(() => {
            for (const [type,entries] of Object.entries(data)) for (const [id,value] of Object.entries(entries)) store.authSet(type,id,value == null ? null : serialize(value));
          });
        },
      },
    },
    saveCreds,
  };
}
