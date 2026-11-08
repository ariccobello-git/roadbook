// Controlla che ogni chiave di testo usata esista in IT/EN/FR e che i segnaposto coincidano
const fs=require('fs'), path=require('path').join(__dirname,'..')+'/';
global.window={}; global.navigator={language:'it'};
const src=fs.readFileSync(path+'i18n.js','utf8'); 
const RB={pref:{lang:'it'}}; global.window.RB=RB; eval(src.replace('var RB = window.RB = window.RB || {};','var RB = window.RB;'));
const D=RB.dict; let bad=0; const PERMS=require(path+'logic.js').PERMS;
for(const k in D){ if(D[k].length!==3||D[k].some(x=>!x||!x.trim())){console.log('INCOMPLETA',k); bad++;}
  const ph=a=>(a.match(/\{\d\}|\{anno\}/g)||[]).sort().join(); if(new Set(D[k].map(ph)).size!==1){console.log('SEGNAPOSTO',k); bad++;} }
const files=fs.readdirSync(path).filter(f=>f.endsWith('.js')&&f!=='i18n.js'&&f!=='sw.js');
const used=new Set();
for(const f of files){ const s=fs.readFileSync(path+f,'utf8'); let m; const re=/\bt\('([a-z0-9_]+)'/g; while((m=re.exec(s))) used.add(m[1]); }
const dyn={x2_err_:['titolo_mancante','data_non_valida','giorni_non_validi','km_non_validi','quota_non_valida','run_sconosciuto','socio_sconosciuto'],push_s_:['on','off','denied','install','unsupported'],sosk_:['moto','salute_mia','salute_altro','moto_d','salute_mia_d','salute_altro_d'],sos_st_:['open','handling','closed'],sos_g_:['open','handling','closed'],sos_rs_:['none','aci','assicura','altro'],title_:['admin','presidente','direttore','vice_direttore','head_road_captain','road_captain','officer','socio'],th_:['arancio','rosso','rosa','viola','indaco','blu','verde','grafite','garage'],m_:['contanti','bonifico'],sc_:['storm','snow','fog','rain1','rain2','rain3','sun3','sun2','clear','wind2','wind3','night','cloud'],ride_:['0','1','2'],tip_:['thunder','heavy','rain','gust','wind','ice','snow','fog','cold','heat','sun'],dress_:['1','2','3','4','5'],rp_:['1','2','3','4'],xp_:['1','2','3'],diff_:['facile','media','impegnativa'],st_:['programmato','annullato','concluso'],k_:['rc','safety','scopa','socio'],ie_:['nome_mancante','email_non_valida','data_non_valida','doppione','ruolo_sconosciuto'],nav_:['apple','google','both','none'],pk_:require(path+'logic.js').PLACE_KINDS,wxf_:['thunder','snow','ice','fog','lowvis','gust','wind','heavy','rain','cold','heat'],wx_lv_:['0','1','2'],ds_:['run','socio','presenza'],rs_:['runs','presenze','soci','meteo'],rsd_:['runs','presenze','soci','meteo'],col_:['date','title','status','days','km','difficulty','meeting','destination','riders','passengers','total','checked','maybe','max','fill','wx','last_name','first_name','role','active','bike','joined_on','phone','email','tessera','attended','signed','run','member','answer','fee'],perm_:PERMS,permd_:PERMS,
 e_:['auth','forbidden','non_trovato','ultimo_admin','tessera_duplicata','titolo_non_valido','nome_mancante','dati_non_validi','dati_mancanti','link_non_valido','tappe_non_valide','run_chiuso','completo','foto_non_valida','limite_foto','troppe_righe','network','server','generic','xls','email','iban','session','nome_non_valido','nome_duplicato','profilo_in_uso','limite_profili','limite_report']};
for(const p in dyn) for(const x of dyn[p]) used.add(p+x);
for(const k of [...used]) if(!(k in D)){ if(/^(e|ie|m|sc|ride|tip|dress|rp|xp|th|title|nav|perm|permd|pk|wxf|ds|rs|rsd|col|wx_lv|st|diff|sosk|sos_rs|push_s|x2_err)_$/.test(k)) continue; console.log('MANCANTE',k); bad++; }
const unused=Object.keys(D).filter(k=>!used.has(k)); console.log('chiavi:',Object.keys(D).length,'usate:',used.size,'inutilizzate:',unused.join(',')||'nessuna');
// rpc usate dal client devono esistere lato database
const rpcs=new Set(); for(const f of files){ const s=fs.readFileSync(path+f,'utf8'); let m; const re=/'(rc_[a-z_]+)'/g; while((m=re.exec(s))) rpcs.add(m[1]); }
console.log('rpc usate:',[...rpcs].join(' '));
console.log(bad?('PROBLEMI '+bad):'OK testi');
process.exit(bad?1:0);
