// Roadbook · apre un link breve di Google Maps (maps.app.goo.gl) e restituisce l'indirizzo completo.
// Segue i reindirizzamenti solo verso domini Google; non salva nulla.
const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|consent\.google\.com|(www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2}))$/i;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function allowed(u: URL) { return u.protocol === 'https:' && ALLOWED.test(u.hostname) && (u.hostname !== 'goo.gl' || u.pathname.startsWith('/maps')); }
function isFinal(u: URL) { return /^(www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(u.hostname) && /^\/maps/.test(u.pathname); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  let u: URL;
  try { const b = await req.json(); u = new URL(String(b && b.url || '').trim().slice(0, 2048)); } catch { return json({ ok: false, error: 'link_non_valido' }, 400); }
  for (let i = 0; i < 6; i++) {
    if (!allowed(u)) return json({ ok: false, error: 'link_non_valido' }, 400);
    if (isFinal(u)) return json({ ok: true, url: u.toString() });
    if (u.hostname === 'consent.google.com') { const c = u.searchParams.get('continue'); if (!c) break; try { u = new URL(c); } catch { break; } continue; }
    let r: Response;
    try { r = await fetch(u.toString(), { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Accept-Language': 'it' }, signal: AbortSignal.timeout(8000) }); }
    catch { return json({ ok: false, error: 'network' }, 502); }
    const loc = r.headers.get('location');
    await r.body?.cancel();
    if (!loc || r.status < 300 || r.status > 399) break;
    try { u = new URL(loc, u); } catch { break; }
  }
  return json({ ok: false, error: 'link_non_valido' }, 422);
});
