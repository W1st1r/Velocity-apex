const ready=new WeakMap();
export async function backupAccountState(env,userId){
 if(!env.DB||!userId)return;
 let init=ready.get(env.DB);if(!init){init=env.DB.prepare('CREATE TABLE IF NOT EXISTS account_authority_backups (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,save_json TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL)').run().catch(e=>{ready.delete(env.DB);throw e;});ready.set(env.DB,init);}await init;
 await env.DB.prepare('INSERT OR IGNORE INTO account_authority_backups(user_id,save_json,revision,created_at) SELECT user_id,save_json,revision,? FROM player_saves WHERE user_id=?').bind(Date.now(),userId).run();
}
