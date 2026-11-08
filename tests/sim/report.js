const fs=require('fs'),R=JSON.parse(fs.readFileSync(__dirname+'/results.json','utf8')),M=JSON.parse(fs.readFileSync(__dirname+'/metrics.json','utf8'));
const f=x=>x==null?'–':x.toFixed(1),pc=x=>Math.round(x*100)+'%';
const sc={base:'Com\'è ora (3.6.0)',bigTargets:'+ tocchi 44px e testi più grandi',guide:'+ guida al primo uso',invite:'+ link d\'invito (accesso a 1 tocco)',qr:'+ check-in QR per i Road Captain',all:'Tutte le modifiche insieme'};
let h=`<meta charset=utf-8><meta name=viewport content="width=device-width"><title>Roadbook – simulazione 6 mesi</title><style>body{font:15px -apple-system,system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1d1d1f}h1{font-size:26px}h2{margin-top:30px}table{border-collapse:collapse;width:100%;font-size:13.5px}td,th{padding:6px 8px;border-bottom:1px solid #e5e5ea;text-align:left}th{background:#f5f5f7}.n{background:#fff4e5;border-radius:12px;padding:12px 14px}</style>
<h1>Roadbook – simulazione d'uso a 6 mesi</h1>
<p class=n><b>Onestà del metodo.</b> È una simulazione, non utenti reali. I numeri di tocchi, caratteri, schermate e i difetti di leggibilità sono <b>misurati sull'app vera</b>. Tempi, errori e abbandoni sono un <b>modello</b> (curva di apprendimento a potenza, tempi tipo KLM) su ${R.base.n} persone simulate (30–70 anni, M/F alternati, dimestichezza informatica 1–5, ruoli: socio, Road Captain, direttivo, segreteria, admin), 3 Run al mese, un Run di più giorni ogni 2 mesi. Serve a <i>confrontare</i> le modifiche tra loro, non a prevedere percentuali assolute.</p>
<h2>Cosa cambia con le modifiche (persone ancora attive a 6 mesi)</h2><table><tr><th>Scenario<th>Mese 1<th>Mese 3<th>Mese 6<th>Richieste d'aiuto /100 Run`;
for(const k of Object.keys(sc))h+=`<tr><td>${sc[k]}<td>${f(R[k].adoptPct.m1)}%<td>${f(R[k].adoptPct.m3)}%<td>${f(R[k].adoptPct.m6)}%<td>${f(R[k].helpPer100)}`;
h+=`</table><h2>Compiti: prima volta, terza, decima (stato attuale)</h2><table><tr><th>Compito<th>1ª volta (s)<th>3ª (s)<th>10ª (s)<th>Errore al 1° tentativo<th>Principianti<th>Esperti`;
for(const t of Object.values(R.base.tasks))h+=`<tr><td>${t.name}<td>${f(t.firstAvg)}<td>${t.t3?f(t.t3):'–'}<td>${t.t10?f(t.t10):'–'}<td>${pc(t.fail1Rate)}<td>${t.lit.L12==null?'–':pc(t.lit.L12)}<td>${t.lit.L45==null?'–':pc(t.lit.L45)}`;
h+=`</table><h2>Chi resta (stato attuale)</h2><table><tr><th>Gruppo<th>Attivi a 6 mesi`;
for(const [g,o] of Object.entries(R.bands))for(const [k,v] of Object.entries(o))h+=`<tr><td>${g}: ${k}<td>${Math.round(100*v.act/v.n)}% (${v.n})`;
h+=`</table><h2>Cosa si può anticipare (in ordine di resa)</h2><ol>
<li><b>Tocchi e testi più grandi</b>: etichette della barra in basso 10,5px (tutte e 6 sotto 12px) e molti pulsanti sotto 44px. Nel modello è la modifica che aiuta di più gli over 50. → fatto in 3.6.1.</li>
<li><b>Modulo "nuovo Run" e "avviso"</b>: sono i compiti più lunghi (≈3 min e ≈1,7 min) con errori al 1° tentativo ≈60%. Da semplificare: modello di Run da duplicare, campi opzionali raccolti.</li>
<li><b>Dati di emergenza</b> (≈2,3 min la prima volta): proporli a piccoli passi, non in un unico modulo.</li>
<li><b>Primo accesso</b>: link d'invito con codice già inserito (1 tocco) invece di 8 caratteri.</li>
<li><b>Check-in con QR</b> per i Road Captain: meno tempo e meno errori dell'appello manuale.</li>
<li><b>Guida breve al primo uso</b> (2 schermate), utile soprattutto ai principianti.</li></ol>
<p>Da <b>non</b> fare ora: la sezione "Utilizzo" (misura d'uso) resta rimandata a dopo 6 mesi dal primo Run reale, come deciso.</p>`;
fs.writeFileSync(__dirname+'/report.html',h);
