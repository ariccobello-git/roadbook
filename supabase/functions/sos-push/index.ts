import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

/* 9076 RoadBook: emergenze (solo a chi le gestisce), prova notifiche, promemoria e partenza dei Run */
Deno.serve(async (req: Request) => {
  const key = req.headers.get('x-push-key') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const kind = body && typeof body.kind === 'string' ? body.kind : '';
  let msgs: any[] = [];
  let pub = '', priv = '';
  if (kind === 'test' || kind === 'remind' || kind === 'start') {
    const ep = kind === 'start' ? body.run : body.endpoint;
    const { data: job, error } = await sb.rpc('rc_push_msgs', { p_key: key, p_kind: kind, p_endpoint: typeof ep === 'string' ? ep : null });
    if (error || !job || !job.ok) return new Response('forbidden', { status: 403 });
    pub = job.pub; priv = job.priv;
    msgs = (job.msgs || []).map((m: any) => ({ sub: m, payload: { title: m.title, body: m.body, tag: m.tag, url: './' }, ttl: m.ttl || 600, urgency: kind === 'test' ? 'normal' : 'high' }));
  } else {
    const { data: job, error } = await sb.rpc('rc_push_job', { p_key: key });
    if (error || !job || !job.ok) return new Response('forbidden', { status: 403 });
    pub = job.pub; priv = job.priv;
    msgs = (job.subs || []).map((s: any) => ({ sub: s, payload: { title: '9076 RoadBook · EMERGENZA', body: 'Nuova richiesta di aiuto. Apri 9076 RoadBook per i dettagli.', tag: 'sos', url: './' }, ttl: 3600, urgency: 'high' }));
  }
  if (!msgs.length) return new Response(JSON.stringify({ ok: true, sent: 0, removed: 0 }), { headers: { 'Content-Type': 'application/json' } });
  webpush.setVapidDetails('mailto:manutenzioneromaten@gmail.com', pub, priv);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(msgs.map(async (m: any) => {
    try {
      await webpush.sendNotification({ endpoint: m.sub.endpoint, keys: { p256dh: m.sub.p256dh, auth: m.sub.auth } }, JSON.stringify(m.payload), { TTL: m.ttl, urgency: m.urgency });
      sent++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(m.sub.endpoint);
    }
  }));
  if (dead.length) await sb.rpc('rc_push_prune', { p_key: key, p_endpoints: dead });
  return new Response(JSON.stringify({ ok: true, sent, removed: dead.length }), { headers: { 'Content-Type': 'application/json' } });
});
