-- Only SCALA bot objects. No existing chat tables or functions are changed.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE SCHEMA scala_fb_private;
REVOKE ALL ON SCHEMA scala_fb_private FROM PUBLIC,anon,authenticated;
CREATE TABLE scala_fb_private.metadata(page text NOT NULL,key text NOT NULL,value text NOT NULL,PRIMARY KEY(page,key));
CREATE TABLE scala_fb_private.jobs(page text NOT NULL,id text NOT NULL,post text NOT NULL,at bigint NOT NULL,author text NOT NULL,text_hash text NOT NULL CHECK(text_hash ~ '^[a-f0-9]{64}$'),status text NOT NULL CHECK(status IN ('queued','sending','uncertain','sent','skipped','answered')),next_at bigint NOT NULL,reply_id text,attempt_at bigint,PRIMARY KEY(page,id));
CREATE INDEX scala_fb_jobs_pending ON scala_fb_private.jobs(page,next_at,at) WHERE status IN ('queued','sending','uncertain');
CREATE INDEX scala_fb_jobs_attempts ON scala_fb_private.jobs(page,attempt_at) WHERE attempt_at IS NOT NULL;
CREATE INDEX scala_fb_jobs_peer_attempts ON scala_fb_private.jobs(page,author,attempt_at) WHERE attempt_at IS NOT NULL;
CREATE TABLE scala_fb_private.paused(page text NOT NULL,peer text NOT NULL CHECK(peer ~ '^[a-f0-9]{64}$'),PRIMARY KEY(page,peer));
CREATE TABLE scala_fb_private.locks(page text PRIMARY KEY,holder uuid NOT NULL,until_at bigint NOT NULL);
ALTER TABLE scala_fb_private.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE scala_fb_private.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scala_fb_private.paused ENABLE ROW LEVEL SECURITY;
ALTER TABLE scala_fb_private.locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA scala_fb_private FROM PUBLIC,anon,authenticated;
INSERT INTO scala_fb_private.metadata VALUES('1369521966245025','enabled','0'),('1369521966245025','ready','0');
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'scala_fb_1369521966245025_verify_token','SCALA Meta webhook verification') WHERE NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='scala_fb_1369521966245025_verify_token');
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'scala_fb_1369521966245025_wake_token','SCALA private recovery invocation') WHERE NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='scala_fb_1369521966245025_wake_token');
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'scala_fb_1369521966245025_peer_key','SCALA stable opt-out hash key') WHERE NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='scala_fb_1369521966245025_peer_key');
SELECT cron.schedule('scala-fe-comments-recovery','* * * * *',
$$SELECT net.http_post(url:='https://tysbnwvzbtolgydceovl.supabase.co/functions/v1/scala-fe-comments/wake',headers:=jsonb_build_object('Content-Type','application/json','x-scala-wake',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='scala_fb_1369521966245025_wake_token')),body:='{}'::jsonb,timeout_milliseconds:=15000) WHERE EXISTS(SELECT 1 FROM scala_fb_private.metadata WHERE page='1369521966245025' AND key='enabled' AND value='1');$$);
