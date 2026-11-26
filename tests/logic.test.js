const L = require(require('path').join(__dirname,'..','logic.js'));
const assert = require('assert'); let n=0; const t=(name,fn)=>{fn(); n++; console.log('ok -',name);};
const PR=[['admin','Amministratore'],['presidente','Presidente'],['direttore','Direttore'],['vice_direttore','Vice direttore'],['head_road_captain','Head Road Captain'],['road_captain','Road Captain'],['officer','Officer'],['socio','Socio'],['c_seg_ab12','Segreteria'],['c_tes_cd34','Tesoriere']].map(([key,name])=>({key,name}));
t('ruoli predefiniti', ()=>{
  const c={'Presidente':'presidente','Direttore':'direttore','Vice Direttore':'vice_direttore','vice-direttore':'vice_direttore','Vicedirettore':'vice_direttore','Head Road Captain':'head_road_captain','HEAD RC':'head_road_captain','Road Captain':'road_captain','Road Capitain':'road_captain','RC':'road_captain','Road Captain (RC)':'road_captain','Officer':'officer','Socio':'socio','':'socio','   ':'socio','Président':'presidente','Directeur':'direttore','Vice Director':'vice_direttore','Amministratore':'admin','member':'socio'};
  for (const k in c) assert.strictEqual(L.resolveRole(k), c[k], k);
  assert.strictEqual(L.resolveRole(undefined),'socio'); assert.strictEqual(L.resolveRole(null),'socio');
  for (const k of ['boh','vice presidente','presidente onorario','socio fondatore']) assert.strictEqual(L.resolveRole(k), null, k);
});
t('ruoli con profili personalizzati', ()=>{
  assert.strictEqual(L.resolveRole('Segreteria',PR),'c_seg_ab12'); assert.strictEqual(L.resolveRole('  tesoriere ',PR),'c_tes_cd34'); assert.strictEqual(L.resolveRole('c seg ab12',PR),'c_seg_ab12');
  assert.strictEqual(L.resolveRole('presidente',PR),'presidente'); assert.strictEqual(L.resolveRole('RC',PR),'road_captain'); assert.strictEqual(L.resolveRole('',PR),'socio');
  assert.strictEqual(L.resolveRole('Capo cassa',PR),null);
  const limited=PR.filter(p=>['socio','c_seg_ab12'].includes(p.key));
  assert.strictEqual(L.resolveRole('Presidente',limited),null,'non assegnabile'); assert.strictEqual(L.resolveRole('RC',limited),null); assert.strictEqual(L.resolveRole('socio',limited),'socio');
});
t('permessi: dipendenze', ()=>{
  assert.deepStrictEqual(L.closePerms(['members_edit']),['members_view','phones_view','personal_view','members_edit']);
  assert.deepStrictEqual(L.closePerms([]),[]); assert.deepStrictEqual(L.closePerms(['runs_edit']),['route_view','runs_edit']);
  assert.deepStrictEqual(L.closePerms(L.PERMS),L.PERMS);
  assert.deepStrictEqual(L.setPerm(['members_view'],'members_edit',true),['members_view','phones_view','personal_view','members_edit']);
  const off=L.setPerm(L.PERMS,'members_view',false); ['members_view','phones_view','personal_view','members_edit','signups_manage','formation_edit','profiles_manage'].forEach(k=>assert(!off.includes(k),k));
  assert.deepStrictEqual(off,['route_view','formation_draft_view','runs_edit','photos_moderate','settings_edit']);
  assert.deepStrictEqual(L.setPerm(['members_view','phones_view'],'phones_view',false),['members_view']);
  assert.deepStrictEqual(L.setPerm(['route_view','runs_edit'],'route_view',false),[]);
  for (let i=0;i<50;i++){ let p=[]; for(let j=0;j<20;j++){ const k=L.PERMS[Math.floor(Math.random()*L.PERMS.length)]; p=L.setPerm(p,k,Math.random()<.6); assert.deepStrictEqual(L.closePerms(p),p); } }
});
t('navigazione', ()=>{
  const run={meeting_point:'Piazzale Ostiense, Roma',stops:[{name:'Caffè',addr:'Via A 1, Grottaferrata'},{name:'Solo nome',addr:''},{name:'x',addr:'  via a 1 grottaferrata '},{name:'Pranzo',addr:'41.9,12.5'}],destination:'Frascati'};
  const p=L.navPoints(run); assert.deepStrictEqual(p,['Piazzale Ostiense, Roma','Via A 1, Grottaferrata','41.9,12.5','Frascati']);
  assert.deepStrictEqual(L.navPoints({}),[]); assert.deepStrictEqual(L.navPoints({destination:'Roma',stops:[{addr:'roma'}]}),['roma']);
  const g=L.googleNav(p); assert.strictEqual(g.length,1);
  const u=new URL(g[0]); assert.strictEqual(u.searchParams.get('origin'),p[0]); assert.strictEqual(u.searchParams.get('destination'),'Frascati'); assert.strictEqual(u.searchParams.get('waypoints'),'Via A 1, Grottaferrata|41.9,12.5'); assert.strictEqual(u.searchParams.get('travelmode'),'driving');
  assert.strictEqual(new URL(L.googleNav(['Roma'])[0]).searchParams.get('destination'),'Roma'); assert(!L.googleNav(['Roma'])[0].includes('origin'));
  assert.deepStrictEqual(L.googleNav([]),[]); assert.deepStrictEqual(L.googleNav(null),[]); assert.strictEqual(L.appleNav,undefined);
  const two=L.googleNav(['A','B']); assert.strictEqual(two.length,1); assert(!two[0].includes('waypoints'));
  // 11 punti = origine + 9 tappe + arrivo: una sola tratta; 12 punti: due tratte
  const P=n=>Array.from({length:n},(_,i)=>'P'+i), sp=x=>new URL(x).searchParams;
  assert.strictEqual(L.googleNav(P(11)).length,1); assert.strictEqual(sp(L.googleNav(P(11))[0]).get('waypoints').split('|').length,9);
  const l12=L.googleNav(P(12)); assert.strictEqual(l12.length,2); assert.strictEqual(sp(l12[0]).get('destination'),'P10'); assert.strictEqual(sp(l12[1]).get('origin'),'P10'); assert.strictEqual(sp(l12[1]).get('destination'),'P11'); assert(!l12[1].includes('waypoints'));
  // 25 punti: nessuna tappa persa, ogni tratta riparte dall'arrivo della precedente
  const l25=L.googleNav(P(25)), seen=[]; l25.forEach((x,i)=>{ const q=sp(x), pts=[q.get('origin')].concat(q.get('waypoints')?q.get('waypoints').split('|'):[],[q.get('destination')]); assert(pts.length<=11); if(i) assert.strictEqual(pts[0],seen[seen.length-1]); seen.push(...(i?pts.slice(1):pts)); });
  assert.deepStrictEqual(seen,P(25)); assert.strictEqual(l25.length,3);
  const tricky=L.googleNav(['A&B=1','C|D','E#F'])[0]; assert.strictEqual(sp(tricky).get('origin'),'A&B=1'); assert.strictEqual(sp(tricky).get('waypoints'),'C|D');
  assert.strictEqual(L.navTool('none'),'none'); ['apple','both','google',undefined,null,''].forEach(v=>assert.strictEqual(L.navTool(v),'google'));
  assert.strictEqual(L.placeQuery({lat:41.7799579,lng:12.4466032,name:'H-D'},'x'),'41.779958,12.446603'); assert.strictEqual(L.placeQuery({name:'Bar',addr:'Via A 1'},'x'),'Bar, Via A 1'); assert.strictEqual(L.placeQuery(null,' Ostia '),'Ostia'); assert.strictEqual(L.placeQuery(null,''),''); assert.strictEqual(L.placeQuery({lat:'',lng:''},'Roma'),'Roma');
  const em=new URL(L.mapEmbedUrl(L.HD_STORE,'','fr')); assert.strictEqual(em.origin,'https://maps.google.com'); assert.strictEqual(em.searchParams.get('output'),'embed'); assert.strictEqual(em.searchParams.get('q'),'41.779958,12.446603'); assert.strictEqual(em.searchParams.get('hl'),'fr');
  assert.strictEqual(new URL(L.mapEmbedUrl(null,'A&B #1')).searchParams.get('q'),'A&B #1'); assert.strictEqual(L.mapEmbedUrl(null,''),null);
  assert.strictEqual(L.HD_STORE.addr,'Via Pontina 583, 00128 Roma'); assert.strictEqual(L.HD_STORE.kind,'hd'); assert(Math.abs(L.HD_STORE.lat-41.78)<0.01&&Math.abs(L.HD_STORE.lng-12.447)<0.01);
});
t('date', ()=>{
  assert.strictEqual(L.parseDate(45000),'2023-03-15');
  assert.strictEqual(L.parseDate('15/03/2023'),'2023-03-15');
  assert.strictEqual(L.parseDate('5-3-23'),'2023-03-05');
  assert.strictEqual(L.parseDate('2023-03-15T10:00'),'2023-03-15');
  assert.strictEqual(L.parseDate('31/02/2023'),''); assert.strictEqual(L.parseDate('abc'),''); assert.strictEqual(L.parseDate(''),''); assert.strictEqual(L.parseDate(null),'');
  assert.strictEqual(L.parseDate('01/01/85'),'1985-01-01'); assert.strictEqual(L.parseDate(new Date(2020,4,1)),'2020-05-01'); assert.strictEqual(L.parseDate(-5),'');
});
t('intestazioni', ()=>{
  const m=L.mapHeaders(['Cognome','Nome','Cellulare','E-mail','N. Tessera','Moto','Ruolo','Iscritto dal','Data di nascita','Note','Altro']);
  assert.deepStrictEqual(m,{first_name:1,last_name:0,phone:2,email:3,tessera:4,bike:5,title:6,joined_on:7,birth_date:8,notes:9});
  const e=L.mapHeaders(['First name','Surname','Mobile','Email']); assert.deepStrictEqual(e,{first_name:0,last_name:1,phone:2,email:3});
  const f=L.mapHeaders(['Prénom','Nom','Téléphone']); assert.deepStrictEqual(f,{first_name:0,last_name:1,phone:2});
});
t('import righe', ()=>{
  const r=L.rowsFromMatrix([[],['Nome','Cognome','Telefono','Email','Ruolo','Data iscrizione','Tessera'],
    ['Mario','Rossi',3331234567,'mario@x.it','Road Captain',44000,'A1'],
    ['Anna','Bianchi','','','', '', ''],
    ['','Verdi'],
    ['Luca','Neri','','nonmail'],
    ['Gigi','Data','','','','31/31/2020'],
    ['mario','rossi','','','','','A1'],
    ['', '', '', '']]);
  assert.strictEqual(r.total,6); assert.strictEqual(r.rows.length,2);
  assert.strictEqual(r.rows[0].phone,'3331234567'); assert.strictEqual(r.rows[0].title,'road_captain'); assert.strictEqual(r.rows[0].joined_on,'2020-06-18');
  assert.deepStrictEqual(r.invalid.map(x=>x.reason),['nome_mancante','email_non_valida','data_non_valida','doppione']);
  assert.strictEqual(r.invalid[0].row,5);
});
t('import senza colonne', ()=>{ assert.deepStrictEqual(L.rowsFromMatrix([['Telefono']]).missing,['first_name','last_name']); assert.deepStrictEqual(L.rowsFromMatrix([]).missing,['first_name','last_name']); assert.deepStrictEqual(L.rowsFromMatrix([[''],['']]).missing,['first_name','last_name']); });
t('tessera HOG e liberatoria', ()=>{
  assert.strictEqual(L.parseYear(2026),'2026'); assert.strictEqual(L.parseYear('2025'),'2025'); assert.strictEqual(L.parseYear('15/03/2026'),'2026'); assert.strictEqual(L.parseYear('si'),''); assert.strictEqual(L.parseYear(''),'');
  let d=L.memberDocs({hog_until:'2026-12-01',release_year:2026},'2026-12-10T07:30:00Z',true); assert.deepStrictEqual(d,{hog:'expired',release:'ok'});
  d=L.memberDocs({hog_until:'2027-01-31'},'2026-12-10',true); assert.deepStrictEqual(d,{hog:'ok',release:'missing'});
  d=L.memberDocs({},'2026-12-10',false); assert.deepStrictEqual(d,{hog:'',release:''});
  d=L.memberDocs({hog_until:'2026-12-10'},'2026-12-10',false); assert.strictEqual(d.hog,'ok');
  const o=L.rowsFromMatrix([['Nome','Cognome','Scadenza HOG','Liberatoria'],['Anna','Rossi','31/01/2027',2026],['Bea','Neri','boh','']],[]);
  assert.strictEqual(o.rows.length,1); assert.strictEqual(o.rows[0].hog_until,'2027-01-31'); assert.strictEqual(o.rows[0].release_year,'2026'); assert.strictEqual(o.invalid[0].reason,'data_non_valida');
  assert.strictEqual(L.resolveRole('Segretaria'),'segretario');
});
t('conteggi', ()=>{ const c=L.counts([{status:'si',passengers:1,checked_in:true},{status:'si',passengers:0},{status:'forse'},{status:'no'}]); assert.deepStrictEqual(c,{si:2,no:1,riders:2,pass:1,total:3,checked:1}); assert.strictEqual(L.counts().total,0); });
t('formazione', ()=>{
  const P=(id,title,j)=>({id,title,joined_on:j});
  let f=L.autoFormation([P('rc','road_captain','2015-01-01'),P('hrc','head_road_captain'),P('o1','officer'),P('o2','officer'),P('s1','socio','2020-01-01'),P('s2','socio','2024-01-01'),P('s3','socio','2018-01-01'),P('s4','socio','2022-01-01'),P('s5','socio','2010-01-01'),P('s6','socio','2023-06-01')]);
  assert.strictEqual(f[0].member_id,'hrc'); assert.strictEqual(f[0].kind,'road_captain');
  assert.strictEqual(f[f.length-1].kind,'scopa'); assert.strictEqual(f[f.length-1].member_id,'o2');
  const ids=f.map(x=>x.member_id).filter(Boolean); assert.strictEqual(new Set(ids).size,ids.length); assert.strictEqual(ids.length,10);
  assert.strictEqual(f.filter(x=>x.kind==='safety').length,2);
  assert.deepStrictEqual(f.filter(x=>x.kind==='socio').map(x=>x.member_id),['s2','s6','s4','s1','s3','s5']);
  f=L.autoFormation([]); assert.deepStrictEqual(f,[{kind:'road_captain',member_id:null},{kind:'scopa',member_id:null}]);
  f=L.autoFormation([P('a','socio')]); assert.deepStrictEqual(f.map(x=>x.kind),['road_captain','socio','scopa']);
  f=L.autoFormation([P('o','officer')]); assert.strictEqual(f[0].member_id,null); assert.strictEqual(f[f.length-1].member_id,'o');
  f=L.autoFormation([P('h','head_road_captain'),P('r','road_captain'),P('r2','road_captain'),P('x','socio')]); assert.strictEqual(f[f.length-1].member_id,'r2');
  f=L.autoFormation([P('h','head_road_captain'),P('r','road_captain'),P('o','officer')]); assert.strictEqual(f[f.length-1].member_id,'o');
  /* Safety Officer iscritti: sempre posti Safety, distribuiti nel gruppo; gli officer tornano soci se i safety bastano */
  f=L.autoFormation([P('r','road_captain'),P('sf1','safety'),P('sf2','safety'),P('sf3','safety'),P('o','officer'),P('o2','officer'),P('a','socio'),P('b','socio'),P('c','socio'),P('d','socio')]);
  assert.deepStrictEqual(f.filter(x=>x.kind==='safety').map(x=>x.member_id),['sf1','sf2','sf3']); assert.strictEqual(f[f.length-1].member_id,'o2'); assert.ok(f.some(x=>x.kind==='socio'&&x.member_id==='o'));
  assert.ok(f[1].kind!=='safety'&&f[f.length-2].kind!=='safety'); assert.strictEqual(new Set(f.filter(x=>x.member_id).map(x=>x.member_id)).size,10);
  f=L.autoFormation([P('r','road_captain'),P('sf','safety'),P('o1','officer'),P('o2','officer'),P('o3','officer'),P('a','socio')]);
  assert.deepStrictEqual(f.filter(x=>x.kind==='safety').map(x=>x.member_id),['sf','o1']); assert.strictEqual(f[f.length-1].member_id,'o3');
  f=L.autoFormation([P('sf','safety')]); assert.deepStrictEqual(f.map(x=>x.kind),['road_captain','safety','scopa']);
  f=L.autoFormation([P('r','road_captain'),P('x','socio')]); assert.strictEqual(f[0].member_id,'r'); assert.strictEqual(f[f.length-1].member_id,null);
});

t('distanze e 500 km', ()=>{
  const roma={lat:41.9028,lng:12.4964}, mi={lat:45.4642,lng:9.19}, d=L.haversine(roma,mi);
  assert.ok(d>470&&d<485,'Roma-Milano '+d); assert.strictEqual(L.haversine(roma,roma),0);
  assert.strictEqual(L.kmWarn(500),true); assert.strictEqual(L.kmWarn(499),false); assert.strictEqual(L.kmWarn(null),false); assert.strictEqual(L.kmWarn(undefined),false);
  const run={days:1,meeting:{name:'Fungo',lat:41.824428,lng:12.462984},dest:{name:'Milano',lat:45.4642,lng:9.19}};
  const km=L.dayKm(run); assert.ok(km>=595&&km<=610,'km '+km); assert.ok(L.kmWarn(km));
  assert.strictEqual(L.dayKm({meeting:{lat:1,lng:1},dest:{addr:'x'}}),null); assert.strictEqual(L.dayKm({meeting:{lat:1,lng:1}}),null); assert.strictEqual(L.dayKm({}),null);
  assert.strictEqual(L.hasCoords({lat:'41.8',lng:'12.4'}),true); assert.strictEqual(L.hasCoords({lat:null,lng:1}),false); assert.strictEqual(L.hasCoords({lat:'',lng:''}),false);
});
t('giorni e punti di navigazione', ()=>{
  const run={days:3,meeting:{name:'A',addr:'Via A',lat:41,lng:12},dest:{name:'Z',addr:'Via Z',lat:43,lng:11},
    stops:[{day:1,addr:'S1',lat:41.5,lng:12},{day:1,end:true,name:'Hotel1',addr:'H1',lat:42,lng:12},{day:2,addr:'S2'},{day:2,end:true,name:'Hotel2',addr:'H2',lat:42.5,lng:11.5}]};
  assert.strictEqual(L.runDays(run),3); assert.strictEqual(L.runDays({}),1); assert.strictEqual(L.runDays({days:99}),1);
  assert.deepStrictEqual(L.navPoints(run,1),['41.000000,12.000000','41.500000,12.000000','42.000000,12.000000']);
  assert.deepStrictEqual(L.navPoints(run,2),['42.000000,12.000000','S2','42.500000,11.500000']);
  assert.deepStrictEqual(L.navPoints(run,3),['42.500000,11.500000','43.000000,11.000000']);
  assert.strictEqual(L.dayKm(run,2),null); assert.ok(L.dayKm(run,3)>0);
  /* giorno singolo: tutte le tappe, gli arrivi "end" ignorati; vecchi Run solo testo */
  assert.deepStrictEqual(L.navPoints({meeting_point:'Roma',destination:'Frascati',stops:[{addr:'Grottaferrata'},{name:'solo nome'}]}),['Roma','Grottaferrata','Frascati']);
  assert.deepStrictEqual(L.navPoints({}),[]); assert.deepStrictEqual(L.navPoints({days:2,meeting_point:'Roma'},2),['Roma']);
  assert.ok(L.googleNav(L.navPoints(run,1))[0].includes('waypoints=41.500000%2C12.000000'));
});
t('ricerca luoghi OSM', ()=>{
  assert.strictEqual(L.overpassQuery('altro',1,1,1000),null); assert.strictEqual(L.overpassQuery('area','x',1,1000),null);
  const q=L.overpassQuery('area',41.82,12.46,15000); assert.ok(q.includes('"highway"="services"')&&q.includes('around:15000,41.82000,12.46000')&&q.includes('out center'));
  assert.ok(L.overpassQuery('hd',41,12,1).includes('around:1000,')); assert.ok(L.overpassQuery('hd',41,12,1e9).includes('around:100000,'));
  const j={elements:[{type:'node',lat:41.9,lon:12.5,tags:{name:'Frascati Est',operator:'Autogrill',highway:'services'}},{type:'way',center:{lat:41.83,lon:12.47},tags:{highway:'services'}},{type:'node',lat:41.83,lon:12.47,tags:{highway:'services'}},{type:'node',tags:{name:'senza coordinate'}}]};
  const r=L.parseOverpass(j,'area',41.824428,12.462984); assert.strictEqual(r.length,2); assert.strictEqual(r[0].name,''); assert.ok(r[0].dist<1&&r[1].dist>5); assert.strictEqual(r[1].name,'Frascati Est');
  assert.strictEqual(L.parseOverpass({elements:[{lat:1,lon:1,tags:{amenity:'restaurant'}}]},'ristorante',0,0).length,0);
  assert.deepStrictEqual(L.parseOverpass(null,'area',1,1),[]);
  const h=L.parseOverpass({elements:[{lat:41.9,lon:12.5,tags:{name:'HD Roma','addr:street':'Via X','addr:housenumber':'3','addr:city':'Roma'}}]},'hd',41.9,12.5); assert.strictEqual(h[0].addr,'Via X 3, Roma');
  const n=L.parseNominatim([{lat:'41.9',lon:'12.5',name:'Colosseo',display_name:'Colosseo, Roma, Lazio',address:{road:'Piazza del Colosseo',house_number:'1',city:'Roma'}},{lat:'x',lon:'1'}]); assert.strictEqual(n.length,1); assert.strictEqual(n[0].addr,'Piazza del Colosseo 1, Roma');
  assert.deepStrictEqual(L.parseNominatim(null),[]); assert.strictEqual(L.parseReverse({error:'x'},41.1234567,12.1).lat,41.123457); assert.strictEqual(L.parseReverse({display_name:'A, B, C, D'},1,2).addr,'A, B, C');
  assert.strictEqual(L.parseOsrm({code:'Ok',routes:[{distance:123456}]}),123); assert.strictEqual(L.parseOsrm({code:'NoRoute'}),null); assert.strictEqual(L.parseOsrm(null),null);
  assert.ok(L.osrmUrl([{lat:1,lng:2},{lat:3,lng:4}]).includes('2.000000,1.000000;4.000000,3.000000')); assert.strictEqual(L.osrmUrl([{lat:1,lng:2},{addr:'x'}]),null);
  const z=L.parseZones({elements:[{lat:1,lon:2,tags:{name:'Zeta'}},{lat:1,lon:2,tags:{name:'alfa'}},{lat:1,lon:2,tags:{name:'ALFA'}},{lat:1,lon:2,tags:{}}]}); assert.deepStrictEqual(z.map(x=>x.name),['alfa','Zeta']);
  assert.ok(L.FUNGO.lat>41.8&&L.ROME_ZONES.length>10&&L.CITIES[0].name==='Roma');
});

t('meteo: categorie e rischi per moto', ()=>{
  assert.strictEqual(L.wxKind(0),'clear'); assert.strictEqual(L.wxKind(3),'cloud'); assert.strictEqual(L.wxKind(45),'fog'); assert.strictEqual(L.wxKind(61),'rain'); assert.strictEqual(L.wxKind(95),'thunder'); assert.strictEqual(L.wxKind(75),'snow'); assert.strictEqual(L.wxKind(66),'freezing'); assert.strictEqual(L.wxKind(null),'unknown'); assert.strictEqual(L.wxKind(),'unknown');
  const base={temp:18,pop:0,precip:0,code:1,wind:10,gust:20,vis:20000};
  assert.deepStrictEqual(L.wxFlags(base),{level:0,flags:[]}); assert.deepStrictEqual(L.wxFlags(null),{level:0,flags:[]});
  assert.deepStrictEqual(L.wxFlags({...base,pop:60}),{level:1,flags:['rain']});
  assert.deepStrictEqual(L.wxFlags({...base,precip:0.3}),{level:1,flags:['rain']});
  assert.strictEqual(L.wxFlags({...base,precip:5,code:65}).level,2); assert.ok(L.wxFlags({...base,precip:5}).flags.includes('heavy'));
  assert.ok(L.wxFlags({...base,code:96}).flags.includes('thunder')); assert.strictEqual(L.wxFlags({...base,code:96}).level,2);
  assert.deepStrictEqual(L.wxFlags({...base,temp:2,precip:0.2}).flags.filter(x=>x!=='rain'),['ice']); assert.strictEqual(L.wxFlags({...base,temp:2,precip:0.2}).level,2);
  assert.deepStrictEqual(L.wxFlags({...base,temp:4}),{level:1,flags:['cold']}); assert.deepStrictEqual(L.wxFlags({...base,temp:34}),{level:1,flags:['heat']}); assert.strictEqual(L.wxFlags({...base,temp:39}).level,2);
  assert.strictEqual(L.wxFlags({...base,gust:46}).level,1); assert.strictEqual(L.wxFlags({...base,gust:60}).level,2); assert.strictEqual(L.wxFlags({...base,wind:31}).level,1);
  assert.strictEqual(L.wxFlags({...base,vis:400}).level,2); assert.strictEqual(L.wxFlags({...base,vis:1500}).level,1);
  assert.strictEqual(L.wxFlags({temp:null,pop:null,precip:null,code:null,wind:null,gust:null,vis:null}).level,0);
});
t('meteo: ore, arrivi e sintesi lungo il percorso', ()=>{
  const start=Date.UTC(2026,10,15,8,0); /* 09:00 ora di Roma */
  assert.strictEqual(L.romeKey(start),'2026-11-15T09:00'); assert.strictEqual(L.romeKey(Date.UTC(2026,6,15,8,20)),'2026-07-15T10:00'); assert.strictEqual(L.romeKey(Date.UTC(2026,6,15,8,40)),'2026-07-15T11:00');
  const times=[]; for(let h=0;h<24;h++) times.push('2026-11-15T'+String(h).padStart(2,'0')+':00');
  const mk=(f)=>({time:times,temperature_2m:times.map((_,h)=>f.t?f.t(h):15),apparent_temperature:times.map(()=>14),precipitation_probability:times.map((_,h)=>f.pop?f.pop(h):0),precipitation:times.map((_,h)=>f.pr?f.pr(h):0),weather_code:times.map(()=>1),wind_speed_10m:times.map(()=>10),wind_gusts_10m:times.map(()=>20),visibility:times.map(()=>20000)});
  const daily={time:['2026-11-15'],sunrise:['2026-11-15T06:55'],sunset:['2026-11-15T16:50']};
  const W={fetched_at:new Date(Date.now()-2*3600000).toISOString(),points:[
    {role:'meeting',label:'Fungo',day:1,lat:41.824,lng:12.463,hourly:mk({}),daily},
    {role:'stop',label:'Sosta',day:1,lat:42.2,lng:12.5,hourly:mk({pop:h=>h>=10?80:0,pr:h=>h>=10?1:0}),daily},
    {role:'dest',label:'Viterbo',day:1,lat:42.42,lng:12.1,hourly:mk({}),daily}]};
  const run={run_date:new Date(start).toISOString(),days:1,km:120};
  { const J={code:'Ok',routes:[{legs:[{duration:3000},{duration:1800}]}]}; assert.deepStrictEqual(L.parseOsrmLegs(J),[50,30]); assert.strictEqual(L.parseOsrmLegs({code:'Ok',routes:[{legs:[{}]}]}),null); assert.strictEqual(L.parseOsrmLegs(null),null);
    const pl=[{},{},{}]; assert.ok(L.applyTimes(pl,[50,30],1)); assert.deepStrictEqual(pl.map(x=>x.tm),[0,50,100]); assert.strictEqual(L.applyTimes([{},{}],[1,2],1),false);
    const p2=[{},{}]; L.applyTimes(p2,[40],2); assert.strictEqual(p2[0].tm,undefined); assert.strictEqual(p2[1].tm,40); }
  const e=L.wxEtas(run,W); assert.strictEqual(e[0].eta,start); assert.ok(e[1].eta>start+30*60000&&e[1].eta<start+90*60000); assert.ok(e[2].eta>e[1].eta+L.WX_DWELL*60000);
  const S=L.wxSummary(run,W,Date.now()); assert.strictEqual(S.pts.length,3); assert.strictEqual(S.pts[0].level,0); assert.strictEqual(S.level,1); assert.strictEqual(S.firstRain.label,'Sosta'); assert.strictEqual(S.stale,false); assert.ok(S.covered); assert.strictEqual(S.alerts.length,0);
  const W2=JSON.parse(JSON.stringify(W)); W2.fetched_at=new Date(Date.now()-5*3600000).toISOString(); W2.points[2].hourly=mk({t:()=>1,pr:()=>0.2}); const S2=L.wxSummary(run,W2,Date.now()); assert.strictEqual(S2.stale,true); assert.strictEqual(S2.level,2); assert.strictEqual(S2.alerts[0].label,'Viterbo'); assert.ok(S2.alerts[0].flags.includes('ice'));
  /* dati che non coprono l'orario: nessun rischio inventato */
  const S3=L.wxSummary({...run,run_date:new Date(Date.UTC(2026,11,20,8)).toISOString()},W,Date.now()); assert.strictEqual(S3.covered,false); assert.strictEqual(S3.level,0);
  assert.strictEqual(L.wxSummary(run,null),null); assert.strictEqual(L.wxSummary(run,{points:[]}),null);
  /* buio all'arrivo: Run di 9h → arrivo dopo il tramonto */
  const late={...run,run_date:new Date(Date.UTC(2026,10,15,14,30)).toISOString(),km:200}; const W3=JSON.parse(JSON.stringify(W)); W3.points.forEach((p,i)=>p.hourly=mk({})); const S4=L.wxSummary(late,W3,Date.now()); assert.ok(S4.dark&&S4.dark.role==='dest');
  /* socio: solo ritrovo e destinazione, senza coordinate */
  const Wm={fetched_at:W.fetched_at,points:[{role:'meeting',label:'Fungo',day:1,hourly:mk({}),daily},{role:'dest',label:'Viterbo',day:1,hourly:mk({}),daily}]}; const E=L.wxEtas(run,Wm); assert.strictEqual(E[0].eta,start); assert.strictEqual(E[1].eta,start+120/65*3600000);
  const w=L.wxWindow(run,start-86400000); assert.ok(w.before&&!w.during); assert.ok(L.wxWindow(run,start+3600000).during); assert.ok(L.wxWindow(run,start+20*3600000).after);
});
t('quote per Run', ()=>{
  const r={id:'r',fee:'12.50'}, free={id:'f'}, bad={id:'x',fee:'abc'}, neg={id:'n',fee:-4};
  assert.strictEqual(L.runFee(r),12.5); assert.strictEqual(L.runFee(free),0); assert.strictEqual(L.runFee(bad),0); assert.strictEqual(L.runFee(neg),0); assert.strictEqual(L.runFee(null),0);
  const s0={run_id:'r',member_id:'a',status:'si',passengers:0}, s2={run_id:'r',member_id:'b',status:'si',passengers:2};
  assert.strictEqual(L.dueOf(r,s0),12.5); assert.strictEqual(L.dueOf(r,s2),37.5); assert.strictEqual(L.dueOf(free,s2),0);
  assert.strictEqual(L.causale('Quota {run} - {cognome} {nome} {rata}',{run:'Bolsena',cognome:'Rossi',nome:'Mario',rata:'rata 1/2'}),'Quota Bolsena - Rossi Mario rata 1/2');
  assert.strictEqual(L.causale('Quota {run} {rata}',{run:'X'}),'Quota X'); assert.strictEqual(L.causale('',{}),''); assert.strictEqual(L.causale(null,null),''); assert.strictEqual(L.causale('{zz} {run}',{run:'A'}),'{zz} A');
});
t('sistemazioni, extra e rate', ()=>{
  const r={id:'r',fee:'10',rooms:[{id:'s',name:'Singola',price:120},{id:'d',name:'Doppia',price:90}],extras:[{id:'c',name:'Cena',price:25},{id:'m',name:'Maglia',price:15.5}],installments:[{due_on:'2026-12-01',pct:30},{due_on:'2027-01-10',pct:70}]};
  const A={run_id:'r',member_id:'a',status:'si',passengers:0,room:'s'}, B={run_id:'r',member_id:'b',status:'si',passengers:1,room:'d',extras:{c:2,m:1}}, C={run_id:'r',member_id:'c',status:'si',passengers:0}, X={run_id:'r',member_id:'x',status:'si',passengers:0,room:'gone',extras:{zz:3,c:0,m:-2}};
  assert.strictEqual(L.dueOf(r,A),120); assert.strictEqual(L.dueOf(r,B),90*2+50+15.5); assert.strictEqual(L.dueOf(r,C),10); assert.strictEqual(L.dueOf(r,X),10);
  assert.strictEqual(L.hasFee({rooms:[{id:'a',name:'x',price:5}]}),true); assert.strictEqual(L.hasFee({extras:[{id:'a',name:'x',price:5}]}),true); assert.strictEqual(L.hasFee({rooms:[{id:'a',name:'x',price:0}]}),false); assert.strictEqual(L.hasFee({}),false);
  assert.deepStrictEqual(L.plan(r,100).map(x=>x.amount),[30,70]); assert.deepStrictEqual(L.plan(r,0),[{due_on:null,amount:0,cum:0}]); assert.deepStrictEqual(L.plan({},50).map(x=>x.amount),[50]);
  assert.deepStrictEqual(L.plan({installments:[{due_on:'2026-12-01',pct:33.33},{due_on:'2027-01-01',pct:33.33},{due_on:'2027-02-01',pct:33.34}]},100).map(x=>x.amount),[33.33,33.33,33.34]);
  let sc=L.schedule(r,A); assert.strictEqual(sc.due,120); assert.deepStrictEqual(sc.rows.map(x=>[x.due_on,x.amount]),[['2026-12-01',36],['2027-01-10',84]]);
  sc=L.schedule({...r,installments:[]},B); assert.deepStrictEqual(sc.rows.map(x=>x.amount),[sc.due]); assert.strictEqual(sc.rows[0].due_on,null); assert.strictEqual(L.schedule({id:'z'},{}).due,0);
  assert.strictEqual(L.extrasOf(r,{extras:{c:1.9}}),25);
});
t('scena meteo e consigli moto', ()=>{
  const base={temp:18,feels:18,pop:0,precip:0,code:1,wind:5,gust:10,vis:20000,uv:null};
  assert.strictEqual(L.wxScene({...base},false).sky,'clear'); assert.strictEqual(L.wxScene({...base},true).sky,'night');
  assert.strictEqual(L.wxScene({...base,temp:31},false).sun,2); assert.strictEqual(L.wxScene({...base,uv:9},false).sun,3); assert.strictEqual(L.wxScene({...base,temp:31},false).sky,'sun'); assert.strictEqual(L.wxScene({...base,temp:31},true).sun,0);
  let sc=L.wxScene({...base,code:63,precip:2.5,wind:25},false); assert.strictEqual(sc.sky,'rain'); assert.strictEqual(sc.rain,2); assert.strictEqual(sc.wind,1); assert.strictEqual(sc.sun,0);
  assert.strictEqual(L.wxScene({...base,code:63,precip:6},false).rain,3); assert.strictEqual(L.wxScene({...base,code:95,precip:0},false).sky,'storm'); assert.ok(L.wxScene({...base,code:95},false).rain>=2);
  assert.strictEqual(L.wxScene({...base,wind:40,gust:62},false).sky,'wind'); assert.strictEqual(L.wxScene({...base,wind:40,gust:62},false).wind,3); assert.strictEqual(L.wxScene({...base,code:73},false).sky,'snow'); assert.strictEqual(L.wxScene({...base,code:45,vis:300},false).sky,'fog');
  assert.strictEqual(L.wxScene(null,false).sky,'cloud'); assert.strictEqual(L.wxScene({...base,code:null},false).sky,'clear');
  const mk=(h,over)=>{const rec={...base,...over}; const f=L.wxFlags(rec); return {ms:Date.UTC(2026,10,10,h),rec,level:f.level,flags:f.flags};};
  let rd=L.wxRide([mk(8,{}),mk(9,{}),mk(10,{}),mk(11,{code:63,precip:1,pop:80}),mk(12,{}),mk(13,{})]);
  assert.strictEqual(rd.level,1); assert.deepStrictEqual(rd.best,{from:Date.UTC(2026,10,10,8),to:Date.UTC(2026,10,10,10)}); assert.ok(rd.tips.includes('rain')); assert.strictEqual(rd.dress,3);
  rd=L.wxRide([mk(8,{code:95,precip:3}),mk(9,{temp:3,feels:0,code:1})]); assert.strictEqual(rd.level,2); assert.strictEqual(rd.best,null); assert.strictEqual(rd.tips[0],'thunder'); assert.strictEqual(rd.dress,3);
  rd=L.wxRide([mk(8,{temp:35,feels:36})]); assert.strictEqual(rd.level,1); assert.ok(rd.tips.includes('heat')&&rd.tips.includes('sun')); assert.strictEqual(rd.dress,5);
  const ptn={daily:{time:['2026-11-10'],sunrise:['2026-11-10T06:45'],sunset:['2026-11-10T16:55']}}; rd=L.wxRide([mk(14,{}),mk(15,{}),mk(16,{}),mk(17,{}),mk(18,{})],ptn); assert.ok(rd.best&&rd.best.to<=Date.UTC(2026,10,10,15),'la finestra non include la notte'); 
  rd=L.wxRide([]); assert.strictEqual(rd.level,0); assert.strictEqual(rd.best,null); assert.strictEqual(rd.dress,null); assert.deepStrictEqual(rd.tips,[]);
  /* sole e notte da alba/tramonto */
  const pt={daily:{time:['2026-11-10'],sunrise:['2026-11-10T06:45'],sunset:['2026-11-10T16:55']}}; assert.strictEqual(L.wxIsNight(pt,Date.UTC(2026,10,10,12)),false); assert.strictEqual(L.wxIsNight(pt,Date.UTC(2026,10,10,20)),true); assert.strictEqual(L.wxIsNight({},Date.UTC(2026,10,10,20)),false);
});
t('dashboard e report', ()=>{
  const R=L.report, y=new Date().getFullYear(), d=(m,dd)=>new Date(Date.UTC(y,m,dd,8)).toISOString();
  const runs=[{id:'a',title:'Uno',run_date:d(0,10),km:100,status:'concluso',max_participants:10,days:1},{id:'b',title:'Due',run_date:d(1,10),km:50,status:'concluso',days:1},{id:'c',title:'Annullato',run_date:d(2,10),km:999,status:'annullato'},{id:'z',title:'Prossimo',run_date:new Date(Date.now()+5*86400000).toISOString(),km:80,status:'programmato'},{id:'old',title:'Vecchio',run_date:new Date(Date.UTC(y-1,5,1)).toISOString(),km:10,status:'concluso'}];
  const members=[{id:'m1',first_name:'Ada',last_name:'Blu',title:'socio',active:true,phone:'1'},{id:'m2',first_name:'Bo',last_name:'Rossi',title:'officer',active:true},{id:'m3',first_name:'Cy',last_name:'Neri',title:'socio',active:false}];
  const signups=[{run_id:'a',member_id:'m1',status:'si',passengers:1,checked_in:true},{run_id:'a',member_id:'m2',status:'si',passengers:0,checked_in:false},{run_id:'a',member_id:'m3',status:'forse'},{run_id:'b',member_id:'m1',status:'si',passengers:0,checked_in:true}];
  const ctx={runs,signups,members,titleName:k=>k.toUpperCase()};
  const D=R.dashboard(ctx,Date.now()); assert.strictEqual(D.runs,2); assert.strictEqual(D.km,150); assert.strictEqual(D.members,2); assert.strictEqual(D.avg,2); assert.strictEqual(D.next.id,'z'); assert.strictEqual(D.cancelled,1); assert.strictEqual(D.top[0].id,'m1'); assert.ok(D.series.length>=3&&D.series.every(s=>typeof s.value==='number'));
  assert.strictEqual(R.dashboard({runs:[],signups:[],members:[]},Date.now()).runs,0);
  const rr=R.rows(ctx,{ds:'run',filters:{year:String(y)},sort:{key:'date',dir:'asc'}}); assert.deepStrictEqual(rr.map(r=>r.title),['Uno','Due','Annullato','Prossimo']); assert.strictEqual(rr[0].total,3); assert.strictEqual(rr[0].fill,30); assert.strictEqual(rr[0].checked,1); assert.strictEqual(rr[0].fee,null);
  assert.strictEqual(R.rows(ctx,{ds:'run',filters:{status:'annullato'}}).length,1); assert.strictEqual(R.rows(ctx,{ds:'run',filters:{year:String(y-1)}}).length,1);
  const so=R.rows(ctx,{ds:'socio',filters:{year:String(y),active:'yes'},sort:{key:'attended',dir:'desc'}}); assert.deepStrictEqual(so.map(s=>[s.last_name,s.attended,s.signed]),[['Blu',2,2],['Rossi',0,1]]); assert.strictEqual(so[0].title,'SOCIO');
  assert.strictEqual(R.rows(ctx,{ds:'socio',filters:{role:'officer'}}).length,1); assert.strictEqual(R.rows(ctx,{ds:'socio',filters:{active:'no'}}).length,1);
  assert.strictEqual(R.rows(ctx,{ds:'presenza',filters:{year:String(y)}}).length,4); assert.strictEqual(R.rows(ctx,{ds:'presenza',filters:{}})[0].member.includes('Blu'),true);
  assert.deepStrictEqual(R.totals('run',['km','total','days','fill','title'],rr),{km:1229,total:4});
  assert.strictEqual(R.cleanDef({ds:'nope',cols:['a']}),null); assert.strictEqual(R.cleanDef({ds:'run',cols:['zz']}),null); assert.strictEqual(R.cleanDef(null),null);
  const cd=R.cleanDef({ds:'run',cols:['km','km','x','title'],filters:{year:'2025',status:'concluso',evil:'1'},sort:{key:'km',dir:'desc'}}); assert.deepStrictEqual(cd,{ds:'run',cols:['km','title'],filters:{year:'2025',status:'concluso'},sort:{key:'km',dir:'desc'}}); assert.strictEqual(R.cleanDef({ds:'run',cols:['km'],filters:{year:'20x5'}}).filters.year,undefined);
  assert.ok(!R.cols('socio',['members_view']).some(c=>c.k==='phone'||c.k==='email')); assert.ok(R.cols('socio',['phones_view','personal_view']).some(c=>c.k==='email'));
  assert.ok(R.STANDARD.every(s=>R.cleanDef(s.def))); assert.deepStrictEqual(L.yearsOf([{run_date:'2024-05-01T00:00:00Z'}])[0]>=y,true);
});

t('secondo livello: date Excel, import Run, presenze', () => {
  const d1 = L.parseDateCell('15/03/2027', '08:30'); assert.strictEqual(d1.getHours(), 8); assert.strictEqual(d1.getDate(), 15);
  assert.strictEqual(L.parseDateCell('31/02/2027'), null); assert.strictEqual(L.parseDateCell('abc'), null); assert.strictEqual(L.parseDateCell('2027-03-15 07:05').getMinutes(), 5);
  assert.strictEqual(L.parseDateCell(46000).getFullYear(), 2025); assert.strictEqual(L.parseDateCell('15/03/2027', '25:00'), null); assert.strictEqual(L.parseDateCell('15/03/1999'), null);
  const mem = [{ id: 'm1', first_name: 'Mario', last_name: 'Rossi' }, { id: 'm2', first_name: 'Anna', last_name: 'Conti' }];
  const rows = [['Titolo', 'Data', 'Ora', 'Giorni', 'Km', 'Difficoltà', 'Quota'], ['Giro A', '15/03/2030', '8:30', 1, '120', 'Facile', '10,5'], ['Giro A', '15/03/2030'], ['', 'x'], ['Weekend', '10/05/2024', '09:00', 40, '9999'], ['Vecchio', '10/05/2024', '09:00', 2, 300, 'impegnativa', ''], ['', '', '', '', '']];
  const att = [['Titolo Run', 'Cognome', 'Nome', 'Presente'], ['Vecchio', 'Rossi', 'Mario', 'si'], ['Vecchio', 'Conti', 'Anna', 'no'], ['Vecchio', 'Zeta', 'Zeno', 'x'], ['Inesistente', 'Rossi', 'Mario', 'si'], ['vecchio', 'Anna', 'Conti', '1']];
  const r = L.parseRunRows(rows, att, [], mem, Date.UTC(2026, 10, 8));
  assert.strictEqual(r.items.length, 5); assert.ok(r.items[0].ok && r.items[0].run.status === 'programmato' && r.items[0].run.fee === '10.5' && r.items[0].run.difficulty === 'facile');
  assert.ok(r.items[1].dup && !r.items[1].ok); assert.ok(r.items[2].errors.includes('titolo_mancante'));
  const w = r.items.find(i => i.title === 'Weekend'); assert.ok(w.errors.includes('giorni_non_validi') && w.errors.includes('km_non_validi'));
  const v = r.items.find(i => i.title === 'Vecchio'); assert.strictEqual(v.run.status, 'concluso'); assert.strictEqual(r.att.length, 2); assert.strictEqual(r.attErrors.length, 2);
  const again = L.parseRunRows(rows, null, [{ title: 'Giro A', run_date: r.items[0].run.run_date }], mem); assert.ok(again.items[0].dup);
  assert.strictEqual(L.parseRunRows([], null, [], mem).items.length, 0); assert.strictEqual(L.parseRunRows([['x']], null, [], mem).items.length, 0);
});
t('secondo livello: calendario .ics', () => {
  const s = L.ics({ id: 'u1', title: 'Giro, dei; Castelli', run_date: '2030-03-15T07:30:00Z', meeting_point: 'Ostia', days: 1, km: 100, description: 'riga1\nriga2' }, 'Roma Chapter', 0);
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n') && s.endsWith('END:VCALENDAR\r\n')); assert.ok(s.includes('SUMMARY:Roma Chapter · Giro\\, dei\\; Castelli')); assert.ok(s.includes('DTSTART:20300315T073000Z') && s.includes('DTEND:20300315T153000Z'));
  assert.ok(s.includes('DESCRIPTION:100 km\\nriga1\\nriga2')); s.split('\r\n').forEach(l => assert.ok(l.length <= 75, 'riga lunga'));
  const m = L.ics({ id: 'u2', title: 'Weekend', run_date: '2030-03-15T07:30:00Z', days: 3, status: 'annullato' }, '', 0); assert.ok(m.includes('DTEND:20300318T073000Z') && m.includes('STATUS:CANCELLED'));
  assert.ok(L.ics({ id: 'u3', title: 'x'.repeat(200), run_date: '2030-03-15T07:30:00Z' }, '', 0).split('\r\n').every(l => l.length <= 75));
});
t('secondo livello: GPX, QR, statistiche', () => {
  const g = L.parseGpx('<gpx><wpt lat="41.9" lon="12.5"><name>Bar &amp; Caffè</name></wpt><wpt lat="42" lon="12.6"/></gpx>'); assert.strictEqual(g.stops.length, 2); assert.strictEqual(g.stops[0].name, 'Bar & Caffè'); assert.strictEqual(g.stops[1].name, 'Tappa 2');
  const t2 = L.parseGpx('<gpx><trk><trkseg><trkpt lat="41.9" lon="12.5"/><trkpt lat="42.5" lon="12.9"/><trkpt lat="43" lon="13"/></trkseg></trk></gpx>'); assert.strictEqual(t2.stops[0].name, 'Partenza'); assert.strictEqual(t2.stops[t2.stops.length - 1].name, 'Arrivo'); assert.ok(t2.km > 100 && t2.km < 160);
  assert.strictEqual(L.parseGpx('<html>no</html>'), null); assert.ok(L.parseGpx('<gpx></gpx>').empty); assert.strictEqual(L.parseGpx('<gpx><wpt lat="999" lon="1"/></gpx>').empty, true);
  const id = '0a1b2c3d-0000-4000-8000-000000000001'; assert.strictEqual(L.parseQr(L.qrPayload(id)), id); assert.strictEqual(L.parseQr('RBK1:xx'), null); assert.strictEqual(L.parseQr('http://evil'), null); assert.strictEqual(L.parseQr(null), null);
  const runs = [{ id: 'r1', run_date: '2026-01-10T08:00:00Z', km: 100, days: 1, status: 'concluso' }, { id: 'r2', run_date: '2026-02-10T08:00:00Z', km: 300, days: 3, status: 'concluso' }, { id: 'r3', run_date: '2026-03-10T08:00:00Z', km: 50, days: 1, status: 'annullato' }, { id: 'r4', run_date: '2099-03-10T08:00:00Z', km: 50, days: 1, status: 'programmato' }];
  const su = [{ run_id: 'r1', member_id: 'a', status: 'si', checked_in: true }, { run_id: 'r2', member_id: 'a', status: 'si', checked_in: true }, { run_id: 'r2', member_id: 'b', status: 'si', checked_in: true }, { run_id: 'r3', member_id: 'a', status: 'si', checked_in: true }, { run_id: 'r1', member_id: 'b', status: 'no', checked_in: false }];
  const sa = L.statsMember(runs, su, 'a', Date.UTC(2026, 5, 1)); assert.deepStrictEqual([sa.done, sa.attended, sa.km, sa.nights, sa.rate], [2, 2, 400, 2, 100]);
  const sb = L.statsMember(runs, su, 'b', Date.UTC(2026, 5, 1)); assert.deepStrictEqual([sb.attended, sb.rate], [1, 50]); assert.strictEqual(L.statsMember(runs, su, 'zz', Date.UTC(2026, 5, 1)).attended, 0);
  const c = L.statsChapter(runs, su, [{ id: 'a', first_name: 'A' }, { id: 'b', first_name: 'B' }], Date.UTC(2026, 5, 1)); assert.strictEqual(c.runs, 2); assert.strictEqual(c.avg, 1.5); assert.strictEqual(c.top[0].id, 'a'); assert.strictEqual(c.active, 2);
});
console.log(n+' test passati');
