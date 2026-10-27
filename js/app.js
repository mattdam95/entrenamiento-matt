(async function(){
/* ---------- almacenamiento ---------- */
const mem = {};
let logsCache = null;
const store = {
  get(k, d){ try{ const v = localStorage.getItem('ab24:'+k); return v==null ? (k in mem ? mem[k] : d) : JSON.parse(v); }catch(e){ return k in mem ? mem[k] : d; } },
  set(k, v){ mem[k] = v; if (k.startsWith('log:')) logsCache = null; try{ localStorage.setItem('ab24:'+k, JSON.stringify(v)); }catch(e){} }
};

/* ---------- fechas ---------- */
const pad2 = n => String(n).padStart(2,'0');
const iso = d => d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const parseIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DCORTO = ['D','L','M','M','J','V','S'];
const DABR = ['dom','lun','mar','mié','jue','vie','sáb'];
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const todayIso = iso(new Date());

/* ---------- plan (markdown) ---------- */
/* el contenido vive en content/plan.md (o embebido en <script id="plan">) */
const embedded = document.getElementById('plan');
/* videos de referencia por ficha (content/videos.json); si no cargan, la app sigue sin esa sección */
const videosReq = fetch('content/videos.json', { cache:'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
/* plan de fuerza (content/fuerza.md); si no carga, la app sigue sin el gimnasio */
const fuerzaReq = fetch('content/fuerza.md', { cache:'no-cache' }).then(r => r.ok ? r.text() : null).catch(() => null);
let text;
try{ text = embedded ? embedded.textContent : await fetch('content/plan.md', { cache:'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }); }
catch(e){ document.getElementById('view').innerHTML = '<p class="disclaimer">No se pudo cargar el plan. Revisá la conexión y volvé a abrir la página.</p>'; return; }
const md = s => window.marked ? marked.parse(s) : '<pre style="white-space:pre-wrap">'+esc(s)+'</pre>';
function esc(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function inline(s){ return window.marked ? marked.parseInline(s) : esc(s); }

/* secciones "## N · Título"; lo anterior a la primera es la intro */
function parseDoc(text){
  const parts = text.replace(/^---[\s\S]*?---\s*/, '').split(/^## /m);
  const sections = parts.slice(1).map(p => {
    const nl = p.indexOf('\n');
    const title = p.slice(0, nl).trim();
    const m = title.match(/^(\d+)\s*·\s*(.*)$/);
    return { n: m ? +m[1] : 0, title: m ? m[2] : title, body: p.slice(nl+1).trim() };
  });
  return { intro: parts[0].replace(/^Índice[\s\S]*$/m, '').trim(), sections, sec: n => sections.find(s => s.n === n) };
}
/* fichas "#### N · Nombre" o "#### Gn · Nombre"; los "### Grupo" intermedios agrupan las que siguen */
function parseFichas(body){
  let group = '';
  const takeGroups = s => s.replace(/^### (.*)\n?/gm, (_, t) => { group = t.trim(); return ''; }).trim();
  const chunks = body.split(/^#### /m);
  const intro = takeGroups(chunks[0]);
  const list = chunks.slice(1).map(chunk => {
    const lines = chunk.split('\n');
    const m = lines[0].match(/^(G?)(\d+)\s*·\s*(.*)$/);
    const g = group;
    let rest = takeGroups(lines.slice(1).join('\n'));
    const sub = rest.match(/^\*([^*]+)\*\s*·?\s*(.*)$/m);
    if (sub) rest = rest.replace(sub[0], '').trim();
    /* anidar las listas de "Errores" bajo su viñeta */
    let inErr = false;
    rest = rest.split('\n').map(l => {
      if (/^- \*\*Errores/.test(l)) { inErr = true; return l; }
      if (/^- \*\*/.test(l)) { inErr = false; return l; }
      if (inErr && /^- /.test(l)) return '    ' + l;
      return l;
    }).join('\n');
    const dose = (rest.match(/^- \*\*Dosis\*\* — (.*)$/m) || [])[1] || '';
    return { n: +m[2], code: (m[1] || 'F') + m[2], group: g, name: m[3].trim(), en: sub ? sub[1].trim() : '', tags: sub ? sub[2].split('·').map(t => t.trim()).filter(Boolean) : [], body: rest, dose };
  });
  return { intro, list };
}
/* fases o etapas: una línea con el número, después "### Título", subtítulo y cuerpo */
function parseStages(body, word){
  const chunks = body.split(/^(\d)\s*$/m), list = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const n = +chunks[i]; const c = chunks[i+1].trim();
    const t = c.match(/^### (.*)$/m); const after = c.replace(/^### .*$/m, '').trim();
    const nl = after.indexOf('\n');
    list.push({ n, title: t ? t[1].trim() : word+' '+n, sub: (nl < 0 ? after : after.slice(0, nl)).trim(), body: nl < 0 ? '' : after.slice(nl+1).trim() });
  }
  return { intro: chunks[0].trim(), list };
}

const doc = parseDoc(text);
const introMd = doc.intro, sections = doc.sections, sec = doc.sec;
/* fichas (sección 6) y fases (sección 7) */
const { intro: fichaIntro, list: fichas } = parseFichas(sec(6).body);
const { intro: faseIntro, list: fases } = parseStages(sec(7).body, 'Fase');
const videos = ((await videosReq) || {}).videos || [];
/* "ficha" llega como número (rehab: 4) o como texto (gimnasio: "G1"); se compara como código */
const vcode = f => { const t = String(f ?? '').trim().toUpperCase(); return /^\d+$/.test(t) ? 'F' + +t : t; };
const videosDe = code => videos.filter(v => v.url && vcode(v.ficha) === code);

/* gimnasio: fichas G (§4), etapas (§5) y entrada en calor (§6) de fuerza.md */
let gym = null;
try{
  const t = await fuerzaReq;
  if (t){
    const d = parseDoc(t), fi = parseFichas(d.sec(4).body), et = parseStages(d.sec(5).body, 'Etapa');
    const warm = (d.sec(6).body.match(/^Cada sesión[^.]*\./m) || [])[0] || 'Cada sesión empieza con **5 min de bici o cinta** y **1–2 series de aproximación** livianas del primer ejercicio.';
    if (fi.list.length && et.list.length) gym = { intro: d.intro, sections: d.sections, sec: d.sec, fichas: fi.list, fichaIntro: fi.intro, etapas: et.list, etapaIntro: et.intro, warm };
  }
}catch(e){ gym = null; }
const fichaDe = code => (code[0] === 'G' ? (gym ? gym.fichas : []) : fichas).find(f => f.code === code);

/* ---------- sesiones por fase y día (de §7 y §8) ---------- */
const F = {
  1:'Isométrico de extensión', 2:'Isométrico de flexión', 3:'Agarre con pelota', 4:'Extensión de muñeca',
  5:'Flexión de muñeca', 6:'Desviación radial y cubital', 7:'Pronación y supinación', 8:'Gripper lento',
  9:'Extensión de dedos con banda', 10:'Granjero / colgarse', 11:'Remo + rotación externa + Y/T', 12:'Estiramientos'
};
const ex = (f, dose, spec) => ({ f, dose, spec });
const act = (name, dose) => ({ name, dose: dose || '' });
/* timer: hold = segundos sostenidos por serie; reps = repeticiones guiadas con el tempo de la ficha */
const WARM = { sets:2, hold:20, rest:45 }, S12 = { sets:2, hold:30, rest:10 }, HANG = { sets:3, hold:20, rest:60 };
const TEMPO = {
  4:[['Subí',3],['Bajá',3]], 5:[['Subí',3],['Bajá',3]], 6:[['Subí',2],['Bajá lento',3]],
  7:[['Supiná',2],['Al centro',2],['Proná',2],['Al centro',2]], 8:[['Cerrá',2],['Sostené',2],['Abrí lento',3]], 9:[['Abrí',2],['Cerrá',3]]
};
const HOLD_LABEL = { 1:'Sostené', 2:'Sostené', 3:'Apretá y sostené', 10:'Colgate', 12:'Estirá suave' };
const s12 = ex(12,'2×20–30 s', S12);
const p1base = [ex(3,'Calentamiento · 2×20 s', WARM), ex(4,'3×15 @ 1 kg · 3-0-3', { sets:3, reps:15, rest:60, tempo:[['Subí con ayuda',3],['Bajá sola',3]] }), ex(5,'2×15 @ 1 kg', { sets:2, reps:15, rest:60 })];
const p2heavy = [ex(3,'Calentamiento · 2×20 s', WARM), ex(4,'4×10 @ 2 kg · 3-0-3', { sets:4, reps:10, rest:75 }), ex(5,'3×10 @ 2 kg', { sets:3, reps:10, rest:75 }), ex(6,'2×12 · 2-0-3', { sets:2, reps:12, rest:60 }), ex(7,'2×10', { sets:2, reps:10, rest:60 }), ex(11,''), s12];
const p3heavy = [ex(4,'3×8–10 · codo más extendido', { sets:3, reps:10, rest:90 }), ex(5,'3×8–10', { sets:3, reps:10, rest:90 }), ex(6,'2×12', { sets:2, reps:12, rest:60 }), ex(7,'2×12', { sets:2, reps:12, rest:60 }), ex(10,'Carry 3×30–40 m · hang 3×15–30 s', HANG), ex(11,'')];
const p4maint = [ex(4,'3×10 pesado', { sets:3, reps:10, rest:90 }), ex(5,'3×10 pesado', { sets:3, reps:10, rest:90 }), ex(7,'2×10', { sets:2, reps:10, rest:60 }), ex(10,'Carry / hang', HANG), ex(11,'')];
const PLAN = {
  0: d => ({ label:'Isométricos diarios', time:'≈15 min', items:[ex(1,'4×30 s · descanso 30 s', { sets:4, hold:30, rest:30 }), ex(2,'5×30–45 s · descanso 60 s', { sets:5, hold:30, rest:60 }), ex(3,'3×20–30 s · descanso 45 s', { sets:3, hold:20, rest:45 })].concat([1,3,5].includes(d)?[ex(11,'Días alternos')]:[]).concat([ex(12,'En pausas', S12)]),
        info:'Aplicá §10 completo esta semana: apoyo de antebrazos, mouse cerca y pausas con timer. Gamepad y piano en pausa sólo esta semana.' }),
  1: d => d===0 ? { label:'Descanso', time:'', items:[act('Caminar / bici')], info:'Descanso de antebrazo.' } : {
        label:'Sesión de fuerza · S', time:'12–15 min',
        items: p1base.concat([1,3,5].includes(d)?[ex(11,'')]:[]).concat([s12])
          .concat(d===2?[act('Aeróbico','30 min')]:[]).concat(d===4?[act('Gamepad','Nivel 1 · §12')]:[]).concat(d===6?[act('Piano','Nivel 1 · §13')]:[]),
        info:'Excéntrico puro las 2 primeras semanas, luego concéntrico-excéntrico. Isométricos (ficha 1) como "reset" en la jornada.' },
  2: d => ({
        0:{ label:'Descanso', time:'', items:[], info:'Descanso de antebrazo.' },
        1:{ label:'Sesión pesada', time:'20–25 min', items:p2heavy, info:'' },
        2:{ label:'Día liviano · L', time:'', items:[ex(8,'3×8 · 2-2-3', { sets:3, reps:8, rest:60 }), ex(9,'Opcional · 2×15', { sets:2, reps:15, rest:45 }), ex(11,''), act('Aeróbico','30 min')], info:'' },
        3:{ label:'Sesión pesada', time:'20–25 min', items:p2heavy.concat([act('Gamepad','Nivel 3–4 a la tarde · §12')]), info:'' },
        4:{ label:'Día liviano · L', time:'', items:[ex(8,'3×8 · 2-2-3', { sets:3, reps:8, rest:60 }), ex(11,''), act('Piano','Nivel 3–4 · §13')], info:'' },
        5:{ label:'Sesión pesada', time:'20–25 min', items:p2heavy, info:'' },
        6:{ label:'Día liviano · L', time:'', items:[act('Aeróbico'), act('Gamepad o piano','Uno solo')], info:'' }
      })[d],
  3: d => ({
        1:{ label:'Sesión pesada', time:'', items:p3heavy, info:'Días sugeridos: el plan pide 2 pesados + 1 de endurance por semana, sin fijar cuáles.' },
        4:{ label:'Sesión pesada', time:'', items:p3heavy, info:'Días sugeridos: el plan pide 2 pesados + 1 de endurance por semana, sin fijar cuáles.' },
        6:{ label:'Endurance', time:'', items:[ex(4,'2×25–30 @ 40–50 % · 1-0-2', { sets:2, reps:25, rest:60, tempo:[['Subí',1],['Bajá',2]] }), ex(5,'2×25–30 @ 40–50 % · 1-0-2', { sets:2, reps:25, rest:60, tempo:[['Subí',1],['Bajá',2]] }), ex(8,'3×15 o sostenes', { sets:3, reps:15, rest:60 }), act('Wrist roller','Opcional · 2 subidas/bajadas @ 1–2 kg')], info:'Entrena la tolerancia a carga baja y sostenida, tu déficit principal.' }
      })[d] || { label: d===0?'Descanso':'Sin sesión de fuerza', time:'', items:[], info:'Gamepad y piano niveles 6–8. Se pueden combinar si las horas de mano del día no superan tu techo semanal ÷ 5.' },
  4: d => [1,4].includes(d) ? { label:'Mantenimiento', time:'15 min', items:p4maint, info:'Los tendones pierden capacidad en semanas si dejás de cargarlos.' }
        : { label:'Actividad libre', time:'', items:[], info:'Regla de picos: ninguna semana más de 20–30 % por encima del promedio de las 4 anteriores en horas de mano.' }
};

/* ---------- gimnasio: sesiones por etapa y día (de fuerza.md §5 y §6) ---------- */
/* gx('G4','3×8–12 · 120 s') → { g, dose, sets, reps:[8,12], rest:120 }; con "N s" por serie usa secs en vez de reps */
const gx = (g, dose, extra) => {
  const m = dose.match(/(\d+)×(\d+)(?:–(\d+))?(\s*s\b)?/), r = m && [+m[2], +(m[3] || m[2])];
  const rest = (dose.match(/·\s*(\d+)\s*s\b/) || [])[1];
  return Object.assign({ g, dose, sets: m ? +m[1] : 0, reps: m && !m[4] ? r : null }, m && m[4] ? { secs:r } : {},
    { rest: rest ? +rest : 0 }, /por (lado|pierna)/.test(dose) ? { lado:true } : {}, extra || {});
};
const SS = ' · superserie';
const torsoA = e => ({ id:'torsoA', label:'Torso A', time:'≈55 min', items:[
  gx('G4','3×8–12 · 120 s'),
  e === 1 ? gx('G1','2×10–12 · 120 s') : gx('G1','3×8–12 · 120 s'),
  gx('G6','2×8–12 · 90 s'),
  e === 1 ? gx('G2','2×10–12 por lado · 90 s') : gx('G2','3×10–12 por lado · 90 s'),
  gx('G7','3×12–20 · 60 s'),
  gx('G10','2×10–15 · 60 s'+SS, { ss:'G11' }), gx('G11','2×10–15 · 60 s'+SS, { ss:'G10' })] });
const torsoB = e => ({ id:'torsoB', label:'Torso B', time:'≈55 min', items:[
  gx('G1', (e === 1 ? '2×10–12' : '3×10–12') + ' · 120 s · agarre supino'),
  gx('G5','3×8–15 · 120 s'),
  e === 1 ? gx('G2','2×10–12 por lado · 90 s') : gx('G3','3×8–12 por lado · 90 s')]
  .concat(e === 1 ? [] : [gx('G9','2×12–15 por lado · 60 s')])
  .concat([gx('G7','3×12–20 · 60 s'), gx('G12','2×10–15 · 60 s'+SS, { ss:'G10' }), gx('G10','2×10–15 · 60 s'+SS, { ss:'G12' })]) });
const piernasA = e => ({ id:'piernasA', label:'Piernas A', time:'≈50 min', items:[
  gx('G13','3×8–12 · 120 s'),
  e === 1 ? gx('G15','2×10–12 · 120 s · liviano') : gx('G15','3×8–12 · 120 s'),
  gx('G14','2×8–12 por pierna · 90 s'), gx('G18','3×10–15 · 75 s'), gx('G19','3×10–15 por pierna · 60 s'),
  gx('G20','Dead bug · 2×8–10 por lado · 60 s')] });
const piernasB = () => ({ id:'piernasB', label:'Piernas B', time:'≈50 min', items:[
  gx('G14','3×8–12 por pierna · 90 s'), gx('G16','3×10–15 · 120 s'), gx('G17','3×10–15 · 75 s'), gx('G18','2×10–15 · 75 s'),
  gx('G19','3×10–15 por pierna · 60 s'), gx('G20','Plancha lateral · 2×20–40 s por lado · 45 s')] });
/* los descansos de Torso C, Empuje y Tirón no están en §5: salen de la dosis de cada ficha */
const torsoC = () => ({ id:'torsoC', label:'Torso C', time:'', items:[
  gx('G7','3×12–20 · 60 s'), gx('G5','3×8–15 · 120 s'), gx('G9','2×12–15 por lado · 60 s'), gx('G8','2×15–20 · 60 s'),
  gx('G10','3×10–15 · 60 s'+SS, { ss:'G11' }), gx('G11','3×10–15 por lado · 60 s'+SS, { ss:'G10' }), gx('G12','2×10–15 · 60 s')] });
const empuje = () => ({ id:'empuje', label:'Empuje', time:'', items:[
  gx('G4','3×8–12 · 120 s'), gx('G5','3×8–15 · 120 s'), gx('G6','3×8–12 · 90 s'), gx('G9','2×12–15 por lado · 60 s'),
  gx('G7','3×12–20 · 60 s'), gx('G11','3×10–15 por lado · 60 s')] });
const tiron = () => ({ id:'tiron', label:'Tirón', time:'', items:[
  gx('G1','3×8–12 · 120 s'), gx('G3','3×8–12 por lado · 90 s'), gx('G2','2×10–12 por lado · 90 s'), gx('G8','2×15–20 · 60 s'),
  gx('G10','3×10–15 · 60 s'), { f:10, dose:'Carry 3×30–40 m o colgarse 3×15–30 s', sets:3, reps:null, rest:60 }],
  info:'Straps: en Fase 4 podés soltarlos en la primera serie de cada tirón y mantenerlos en las siguientes.' });
const off = (label, info) => ({ id:null, label, time:'', items:[], info: info || '' });
const RIR1 = 'Etapa 1: 3 repeticiones en reserva en todo. Straps en todos los tirones.';
const RIR = 'Grandes con 1–2 en reserva; en los chicos, la última serie con 0–1. Nunca al fallo en los 🟡.';
/* índice = día de la semana (0 = domingo) */
const GYM = {
  1: [off('Descanso'), torsoA(1), piernasA(1), off('Antebrazo pesado en casa', 'Sin gimnasio: hoy toca la sesión pesada de antebrazo.'), piernasB(1), torsoB(1), off('Aeróbico o descanso')],
  2: [off('Descanso'), torsoA(2), piernasA(2), off('Descanso'), torsoB(2), piernasB(2), off('Endurance de antebrazo + aeróbico opcional', 'Sin gimnasio: endurance de antebrazo en casa (15 min).')],
  3: [off('Descanso'), torsoA(3), piernasA(3), off('Endurance de antebrazo en casa', 'Sin gimnasio: en la Etapa 3 la endurance de antebrazo pasa al miércoles.'), torsoB(3), piernasB(3), torsoC()],
  4: [off('Descanso'), empuje(), tiron(), piernasA(4), empuje(), tiron(), piernasB(4)]
};
const gymDay = (etapa, dow) => { const s = GYM[etapa][dow]; return s.items.length ? Object.assign({}, s, { info: [s.info, etapa === 1 ? RIR1 : RIR].filter(Boolean).join(' ') }) : s; };
/* qué fases de antebrazo corresponden a cada etapa */
const ETAPA_FASE = { 1:[2], 2:[3], 3:[3,4], 4:[4] };
const itemCode = it => it.g || 'F' + it.f;

/* ---------- registro de cargas: lógica pura (sin DOM ni store) ---------- */
/* equipo por ficha (§2 y §4): maq = máquina o polea (placas), mancu = mancuernas, kb = kettlebell,
   bw = peso corporal (solo reps), lastre = peso corporal con kettlebell opcional (G14) */
const EQUIPO = { G1:'maq', G2:'maq', G3:'kb', G4:'mancu', G5:'bw', G6:'mancu', G7:'mancu', G8:'maq', G9:'maq', G10:'mancu',
  G11:'maq', G12:'mancu', G13:'kb', G14:'lastre', G15:'kb', G16:'kb', G17:'maq', G18:'maq', G19:'bw', G20:'bw' };
const MANCU = [1,2,3,4,5,6,8,10], KB = [6,14,18];
/* pasos del stepper de peso: el salto real de cada equipo */
const PASOS = { mancu:[1,2,3,4,5,6,8,10,12,14,16,18,20], kb:[4,6,8,10,12,14,16,18,20,22,24,28,32], lastre:[0,4,6,8,10,12,14,16,18,20,24], bw:[0,2,4,6,8,10,12,14,16,18,20] };
const eqDe = code => EQUIPO[code] || 'mancu';
const defUnit = eq => eq === 'maq' ? 'placas' : eq === 'bw' || eq === 'lastre' ? 'bw' : 'kg';
const defPeso = (eq, u) => u === 'placas' ? 1 : u === 'bw' ? 0 : eq === 'kb' ? 14 : eq === 'maq' ? 10 : 4;
function stepPeso(eq, u, w, dir){
  if (u === 'placas') return Math.max(0, w + dir);
  const l = u === 'bw' ? PASOS[eq === 'lastre' ? 'lastre' : 'bw'] : PASOS[eq];
  if (!l) return Math.max(0, Math.round((w + dir * 2.5) * 10) / 10);
  if (dir > 0) return l.find(x => x > w) ?? w + (l[l.length-1] - l[l.length-2]);
  return [...l].reverse().find(x => x < w) ?? w;
}
/* peso siguiente de la doble progresión (§3), o null si ya no hay más */
function proxPeso(eq, u, w){
  if (u === 'placas') return w + 1;
  if (u === 'kg') return eq === 'mancu' ? MANCU.find(x => x > w) ?? null : eq === 'kb' ? KB.find(x => x > w) ?? null : w + 2.5;
  if (u === 'bw' && eq === 'lastre') return KB.find(x => x > w) ?? null;
  return null;
}
/* toca subir si en la última sesión todas las series llegaron al tope del rango.
   kind: 'peso' (sube el peso), 'reps' (mancuernas al máximo: seguir sumando reps), 'variante' (paso siguiente de la ficha) */
function progresion(sets, range, eq, secs){
  if (!sets || !sets.length || !range || sets.some(s => s.r < range[1])) return null;
  const top = sets.reduce((a, s) => s.w > a.w ? s : a, sets[0]), u = top.u, w = top.w;
  if (secs) return { kind:'variante', w, u, text:`Llegaste a ${range[1]} s en todas las series: pasá a la variante más difícil de la ficha.` };
  const nx = proxPeso(eq, u, w);
  if (nx != null) return { kind:'peso', w:nx, u, from:w, text:`${fmtW(w, u) || 'Sin lastre'} → ${fmtW(nx, u)}, y volvé a ${range[0]}.` };
  if (eq === 'mancu' && u === 'kg'){
    if (sets.every(s => s.r >= 25)) return { kind:'variante', w, u, text:`Con ${fmtW(w, u)} y 25 reps: tempo lento (3 s de bajada + 1 s de pausa abajo) y después la variante más difícil de la ficha.` };
    return { kind:'reps', w, u, text:`Con ${fmtW(w, u)} ya no hay mancuerna más pesada: seguí sumando reps hasta 20–25.` };
  }
  if (eq === 'kb' || eq === 'lastre') return { kind:'variante', w, u, text:`Ya estás en ${fmtW(w, u).replace('+', '')}: usá una kettlebell del gimnasio más pesada o pasá al paso siguiente de la ficha.` };
  return { kind:'variante', w, u, text:'Llegaste al tope del rango en todas las series: pasá al paso siguiente de la ficha.' };
}
/* valores con que arranca la serie k (0 = primera): lo de la misma serie la última vez;
   si toca subir, el peso sugerido (o el que ya usaste hoy) y el piso del rango */
function precarga(k, prev, hoy, prog, range, eq, unit){
  const base = prev[k] || hoy[hoy.length-1] || prev[prev.length-1] || null;
  const u = unit || (base && base.u) || defUnit(eq), last = hoy[hoy.length-1];
  if (prog && prog.u === u && prog.kind !== 'reps') return { w: last && last.u === u ? last.w : prog.w, u, r: range[0] };
  if (base) return { w: base.u === u ? base.w : defPeso(eq, u), u, r: base.r };
  return { w: defPeso(eq, u), u, r: range[0] };
}
const epley = (w, r) => w * (1 + r / 30);
const metrica = s => s.u === 'bw' || s.secs ? s.r + s.w / 100 : epley(s.w, s.r);
const mejorSerie = sets => sets.reduce((a, s) => !a || metrica(s) > metrica(a) ? s : a, null);
/* logs: [{ date, L }] en orden ascendente → sesiones de un ejercicio, separando las por tiempo de las por reps */
const sesionesDe = (logs, code, secs) => logs.map(({ date, L }) => ({ date, sets: ((L.sets || {})[code] || []).filter(s => !!s.secs === !!secs) })).filter(x => x.sets.length);
/* "Tu historial": unidad dominante, mejor serie de las últimas n sesiones y diferencia desde la primera */
function historial(ses, n){
  if (!ses.length) return null;
  const last = ses.slice(-n), cnt = {};
  last.forEach(x => x.sets.forEach(s => { cnt[s.u] = (cnt[s.u] || 0) + 1; }));
  const u = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const bars = last.map(x => { const b = mejorSerie(x.sets.filter(s => s.u === u)); return b && { date:x.date, set:b, v:metrica(b) }; }).filter(Boolean);
  const first = ses.map(x => mejorSerie(x.sets.filter(s => s.u === u))).find(Boolean), lastB = bars[bars.length-1].set;
  const diff = ses.length > 1 ? (u === 'bw' || lastB.secs ? lastB.r - first.r : lastB.w - first.w) : null;
  return { u, bars, diff, first, list: ses.slice(-5).reverse() };
}
/* peso corporal: regs [{ date, bw }]; las semanas son bloques de 7 días que terminan en "hasta" */
function promedio(regs, desde, hasta){ const v = regs.filter(x => x.date >= desde && x.date <= hasta).map(x => x.bw); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function semanas(regs, hasta, n){
  const h = parseIso(hasta);
  return [...Array(n)].map((_, i) => { const fin = addDays(h, -7 * (n - 1 - i)); return promedio(regs, iso(addDays(fin, -6)), iso(fin)); });
}
/* tendencia (§3): +1 a 1,5 kg por mes; si en 3 semanas no se movió, sumar un snack; si sube más de 2 kg en un mes, sacarlo */
function tendencia(regs, hasta){
  const h = parseIso(hasta), a7 = promedio(regs, iso(addDays(h, -6)), hasta);
  const a3 = promedio(regs, iso(addDays(h, -27)), iso(addDays(h, -21))), a4 = promedio(regs, iso(addDays(h, -34)), iso(addDays(h, -28)));
  return { a7, d3: a7 != null && a3 != null ? a7 - a3 : null, d4: a7 != null && a4 != null ? a7 - a4 : null,
    quieto: a7 != null && a3 != null && a7 - a3 < 0.3, rapido: a7 != null && a4 != null && a7 - a4 > 2 };
}
/* formato: "4 placas", "10 kg", "+6 kg" (lastre) */
const num = (v, d) => (Math.round(v * 10) / 10).toFixed(d ?? (v % 1 ? 1 : 0)).replace('.', ',');
const fmtW = (w, u) => u === 'placas' ? `${num(w)} placa${w === 1 ? '' : 's'}` : u === 'bw' ? (w > 0 ? `+${num(w)} kg` : '') : `${num(w)} kg`;
const fmtR = s => s.secs ? s.r + ' s' : '' + s.r;
/* "4 placas × 12 · 12, 5 placas × 10": agrupa series seguidas con el mismo peso */
function fmtSets(sets){
  const runs = [];
  sets.forEach(s => { const r = runs[runs.length-1]; if (r && r.w === s.w && r.u === s.u) r.rs.push(fmtR(s)); else runs.push({ w:s.w, u:s.u, rs:[fmtR(s)] }); });
  return runs.map(r => { const wl = fmtW(r.w, r.u); return (wl ? wl + ' × ' : '') + r.rs.join(' · '); }).join(', ');
}
const etiqueta = s => s.u === 'bw' ? (s.w > 0 ? `+${num(s.w)}×` : '') + fmtR(s) : `${num(s.w)}×${fmtR(s)}`;
function fmtDiff(d, u, secs){
  const sg = d > 0 ? '+' : d < 0 ? '−' : '', a = Math.abs(d);
  if (u === 'bw' || secs) return d ? `${sg}${a}${secs ? ' s' : ' reps'}` : 'Igual que la primera sesión';
  return d ? sg + fmtW(a, u) : 'Mismo peso que la primera sesión';
}
const fechaCorta = d => { const x = parseIso(d); return `${DABR[x.getDay()]} ${x.getDate()}`; };
/* ---------- fin de la lógica pura ---------- */

/* ---------- estado ---------- */
let state = {
  tab: ['hoy','programa','fichas','guia'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'hoy',
  date: todayIso,
  openPhase: null,
  openEtapa: null,
  rehabOpen: false,
  q: '',
  /* segmentos de Programa y Fichas: 'rehab' | 'gym' */
  seg: Object.assign({ programa:'rehab', fichas:'rehab' }, store.get('seg', {}))
};
if (!gym) state.seg = { programa:'rehab', fichas:'rehab' };
const settings = () => Object.assign({ phase: 1, start: todayIso, sound: true, etapa: 1 }, store.get('settings', {}));
const etapaOk = s => (ETAPA_FASE[s.etapa] || []).includes(s.phase);
const log = date => store.get('log:'+date, {});
const setLog = (date, patch) => store.set('log:'+date, Object.assign(log(date), patch));
/* todos los logs en orden de fecha; se rearma cuando cambia alguno (store.set) */
function allLogs(){
  if (logsCache) return logsCache;
  const keys = new Set(Object.keys(mem).filter(k => k.startsWith('log:')));
  try{ for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k.startsWith('ab24:log:')) keys.add(k.slice(5)); } }catch(e){}
  return logsCache = [...keys].sort().map(k => ({ date:k.slice(4), L:store.get(k, {}) }));
}
/* registro de cargas: series de un día, sesiones anteriores y si toca subir */
const setsDia = (code, secs, date) => (((log(date).sets || {})[code]) || []).filter(s => !!s.secs === !!secs);
const previas = (code, secs, date) => sesionesDe(allLogs().filter(x => x.date < date), code, secs);
function progDe(it, date){ const p = previas(it.g, it.secs, date); return progresion(p.length ? p[p.length-1].sets : null, it.reps || it.secs, eqDe(it.g), !!it.secs); }
const unidad = code => store.get('units', {})[code];
function weekOf(date){ const s = parseIso(settings().start); return Math.max(1, Math.floor((parseIso(date) - s) / 864e5 / 7) + 1); }
const zone = v => v <= 3 ? 'g' : v === 4 ? 'y' : 'r';

/* ---------- render ---------- */
const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $sheetInner = document.getElementById('sheetInner');

function render(){
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === state.tab));
  movePill();
  ({ hoy: renderHoy, programa: renderPrograma, fichas: renderFichas, guia: renderGuia })[state.tab]();
}

function head(eyebrow, title, right){
  return `<div><div class="eyebrow">${eyebrow}</div><div class="row between"><h1 class="large">${title}</h1>${right||''}</div></div>`;
}

const scale = (key, val) => [...Array(11)].map((_, v) => `<button class="z-${zone(v)}" data-${key}="${v}" aria-pressed="${val===v}" aria-label="${v} de 10">${v}</button>`).join('');
function renderHoy(){
  const s = settings(), d = parseIso(state.date), dow = d.getDay();
  const ses = PLAN[s.phase](dow);
  const L = log(state.date), checks = L.checks || {};
  const total = ses.items.length, done = ses.items.filter((_, i) => checks[i]).length;
  const monday = addDays(d, -((dow+6)%7));
  const days = [...Array(7)].map((_, i) => addDays(monday, i));
  const isToday = state.date === todayIso;

  const items = ses.items.map((it, i) => {
    const on = !!checks[i];
    const code = it.f ? `<span class="fnum">F${it.f}</span>` : `<span class="fnum x">+</span>`;
    const name = it.f ? F[it.f] : it.name;
    const text = `<div style="flex:1;min-width:0"><div class="name">${name}${it.f?'<span class="more" aria-hidden="true"> ›</span>':''}</div>${it.dose?`<div class="dose mono">${it.dose}</div>`:''}</div>`;
    return `<div class="ex ${on?'done':''}">${it.f ? `<button class="exinfo" data-ficha="F${it.f}" aria-label="Ver ficha de ${name}">${code}${text}</button>` : code + text}${it.spec?`<button class="play" data-timer="${i}" aria-label="Timer de ${name}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg></button>`:''}<button class="checkbtn" data-check="${i}" aria-pressed="${on}" aria-label="Marcar hecho"><span class="check"></span></button></div>`;
  }).join('');
  const ring = (done, total) => { const C = 2*Math.PI*26, frac = total ? done/total : 0;
    return `<svg class="ring" viewBox="0 0 62 62"><circle cx="31" cy="31" r="26" stroke="var(--hair)"/><circle cx="31" cy="31" r="26" stroke="var(--ok)" stroke-dasharray="${C*frac} ${C}" transform="rotate(-90 31 31)"/><text x="31" y="36" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${done}/${total}</text></svg>`; };
  /* antebrazo: completo se pliega a una fila; tocarla la despliega */
  const folded = total > 0 && done === total && !state.rehabOpen;
  const rehabHtml = folded
    ? `<button class="glass pad row fold" data-fold aria-expanded="false" style="width:100%;text-align:left"><span class="check done"></span>
        <div style="flex:1;min-width:0"><div class="eyebrow">Antebrazo · primero</div><div style="font-size:16px;font-weight:600;margin-top:3px">${ses.label} · ${total}/${total} hecho</div></div><span class="chev">›</span></button>`
    : `<section class="glass pad">
      <div class="row between" style="margin-bottom:${total?6:0}px${total && done === total ? ';cursor:pointer" data-fold role="button" aria-expanded="true' : ''}">
        <div><div class="eyebrow">Antebrazo · primero</div><div style="font-size:20px;font-weight:700;margin-top:3px">${ses.label}</div><div class="muted" style="font-size:13px;margin-top:2px">${ses.time || (total ? total+' ítems' : 'Sin ejercicios')}</div></div>
        ${total ? ring(done, total) : ''}
      </div>
      <div>${items}</div>
      ${ses.info ? `<div class="info">${ses.info}</div>` : ''}
    </section>`;

  /* gimnasio: checks por código en log.gym */
  let gymHtml = '';
  if (gym){
    const gs = gymDay(s.etapa, dow), gl = L.gym || {};
    if (!gs.items.length) gymHtml = `<section class="glass pad row"><span class="fnum x">—</span><div style="flex:1;min-width:0"><div class="eyebrow">Gimnasio</div><div style="font-size:16px;font-weight:600;margin-top:3px">${gs.label}</div>${gs.info ? `<div class="note" style="margin-top:3px">${gs.info}</div>` : ''}</div></section>`;
    else {
      const gdone = gs.items.filter(it => gl[itemCode(it)]).length;
      /* registro de cargas: chip "↑ Subí" si toca subir y las series de hoy bajo la dosis */
      const rows = gs.items.map(it => {
        const c = itemCode(it), on = !!gl[c], name = it.g ? (fichaDe(c) || {}).name || c : F[it.f];
        const up = it.g && progDe(it, state.date), hoy = it.g ? setsDia(c, it.secs, state.date) : [];
        return `<div class="ex ${on?'done':''}"><button class="exinfo" data-ficha="${c}" aria-label="Ver ficha de ${esc(name)}"><span class="fnum ${it.g?'g':''}">${c}</span><div style="flex:1;min-width:0"><div class="name">${esc(name)}${up ? '<span class="upchip">↑ Subí</span>' : ''}<span class="more" aria-hidden="true"> ›</span></div><div class="dose mono">${it.dose}</div>${hoy.length ? `<div class="dose mono done-sets">${esc(fmtSets(hoy))}</div>` : ''}</div></button>${it.g ? `<button class="play" data-gplay="${c}" aria-label="Series de ${esc(name)}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg></button>` : ''}<button class="checkbtn" data-gcheck="${c}" aria-pressed="${on}" aria-label="Marcar hecho"><span class="check"></span></button></div>`;
      }).join('');
      const conSets = Object.values(L.sets || {}).some(a => a.length) || L.gymPain != null;
      gymHtml = `<section class="glass pad">
        <div class="row between" style="margin-bottom:6px">
          <div><div class="eyebrow">Gimnasio · ${gs.label}</div><div style="font-size:20px;font-weight:700;margin-top:3px">${gs.time || gs.items.length + ' ejercicios'}</div><div class="muted" style="font-size:13px;margin-top:2px">Etapa ${s.etapa}</div></div>
          ${ring(gdone, gs.items.length)}
        </div>
        <div class="info warm">${inline(gym.warm)}</div>
        <div>${rows}</div>
        ${conSets ? `<div class="divider"></div><div class="eyebrow">Molestia máxima de antebrazo durante el gimnasio</div><div class="scale">${scale('gpain', L.gymPain)}</div>` : ''}
        ${gs.info ? `<div class="info">${gs.info}</div>` : ''}
      </section>`;
    }
  }

  const pain = L.pain, morning = L.morning, hours = L.hours ?? 0;
  const painNote = pain == null ? 'Tocá el dolor máximo que sentiste durante la sesión o la actividad.'
    : pain <= 3 ? 'Dentro de lo aceptable. Si mañana estás en tu línea de base, cuenta para subir.'
    : pain === 4 ? 'Mantené: no subas carga hasta que vuelva a ≤3/10.'
    : 'Por encima del límite. Bajá un escalón: peso o nivel anterior (§9).';

  /* últimos 14 días */
  const hist = [...Array(14)].map((_, i) => { const dd = iso(addDays(parseIso(todayIso), i-13)); return { dd, v: log(dd).pain }; });
  const bars = hist.map(h => `<div class="${h.v==null?'':zone(h.v)} ${h.dd===state.date?'sel':''}" style="height:${h.v==null?3:Math.max(6, h.v*10)}%" title="${h.dd}: ${h.v ?? '—'}"></div>`).join('');

  $view.innerHTML = `
    ${head(`${DIAS[dow]} ${d.getDate()} ${MESES[d.getMonth()]}`, isToday ? 'Hoy' : DIAS[dow],
      `<button class="chip glass" data-settings><span class="dot"></span>F${s.phase}${gym ? ` · Etapa ${s.etapa}` : ''} · sem ${weekOf(state.date)}</button>`)}
    <div class="week glass">${days.map(x => { const k = iso(x), lk = log(k), has = lk.pain != null || lk.bw != null || Object.values(lk.checks||{}).some(Boolean) || Object.values(lk.gym||{}).some(Boolean) || Object.values(lk.sets||{}).some(a => a.length);
      return `<button class="day ${k===todayIso?'today':''}" data-date="${k}" aria-pressed="${k===state.date}">${DCORTO[x.getDay()]}<b>${x.getDate()}</b><i class="${has?'has':''}"></i></button>`; }).join('')}</div>
    ${rehabHtml}
    ${gymHtml}
    <section class="glass pad">
      <div class="row between"><div class="eyebrow">Dolor máximo del día</div><span class="mono muted" style="font-size:13px">límite 3–4</span></div>
      <div class="scale">${scale('pain', pain)}</div>
      <div class="note">${painNote}</div>
      <div class="divider"></div>
      <div class="row between"><div class="eyebrow">Al despertar</div><span class="muted" style="font-size:13px">vs. tu línea de base</span></div>
      <div class="scale">${scale('morning', morning)}</div>
      <div class="divider"></div>
      <div class="row between"><div><div class="eyebrow">Horas de mano</div><div class="note" style="margin-top:3px">Trabajo + juego + piano + celular</div></div>
        <div class="stepper"><button data-hours="-0.5" aria-label="Menos media hora">−</button><output class="mono">${hours}</output><button data-hours="0.5" aria-label="Más media hora">+</button></div></div>
    </section>
    <section class="glass pad">
      <div class="row between"><div class="eyebrow">Dolor · últimos 14 días</div><span class="mono muted" style="font-size:12px">0–10</span></div>
      <div class="chart"><span class="lim" style="bottom:${3.5*10}%"></span>${bars}</div>
      <div class="axis"><span>${hist[0].dd.slice(8)}/${hist[0].dd.slice(5,7)}</span><span>hoy</span></div>
    </section>
    ${bwCard(L)}
    <p class="disclaimer">Orientativo: no reemplaza a tu traumatólogo o kinesiólogo. Los registros se guardan sólo en este dispositivo. ${backupAge()} <button data-settings style="color:var(--accent);font-size:inherit">Hacer backup</button></p>`;
}

/* peso corporal (§3 y §7 de fuerza.md): bw en el log del día, promedio de 7 días y promedios semanales */
function bwCard(L){
  const regs = allLogs().filter(x => typeof x.L.bw === 'number').map(x => ({ date:x.date, bw:x.L.bw }));
  const t = tendencia(regs, state.date), wk = semanas(regs, state.date, 8), vals = wk.filter(v => v != null);
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const bars = wk.map((v, i) => `<div class="${v == null ? '' : i === 7 ? 'a' : 'b'}" style="height:${v == null ? 3 : Math.round(12 + 88 * (v - lo) / (hi - lo))}%" title="${v == null ? '—' : num(v, 1) + ' kg'}"></div>`).join('');
  const sg = d => (d >= 0 ? '+' : '−') + num(Math.abs(d), 1) + ' kg';
  const tip = t.rapido ? `Subió ${sg(t.d4)} en un mes, más de 2 kg: sacá el snack que sumaste.`
    : t.quieto ? `En 3 semanas el promedio no se movió (${sg(t.d3)}): sumá un snack (yogur con avena, pan con queso y huevo, banana con maní).` : '';
  return `<section class="glass pad">
      <div class="row between"><div><div class="eyebrow">Peso corporal</div>
        <div class="note" style="margin-top:3px">${t.a7 != null ? `Promedio 7 días: <b class="mono">${num(t.a7, 1)} kg</b>` : 'Sin registros esta semana'}</div></div>
        <div class="stepper"><button data-bw="-0.1" aria-label="Menos 100 g">−</button><output class="mono">${L.bw != null ? num(L.bw, 1) : '—'}</output><button data-bw="0.1" aria-label="Más 100 g">+</button></div></div>
      ${vals.length ? `<div class="chart c8">${bars}</div><div class="axis"><span>hace 8 semanas</span><span>${t.d3 != null ? `3 semanas: ${sg(t.d3)}` : 'esta semana'}</span></div>` : ''}
      <div class="note">${L.bw == null ? 'Tocá + o − para anotar: arranca en tu último registro. ' : ''}Meta: +1 a 1,5 kg por mes. Pesate 3 mañanas por semana y mirá el promedio.</div>
      ${tip ? `<div class="note alert">${tip}</div>` : ''}
    </section>`;
}

/* control segmentado Antebrazo/Gimnasio de Programa y Fichas (sólo si cargó fuerza.md) */
function segCtl(key, a){
  if (!gym) return '';
  return `<div class="seg">${[['rehab', a], ['gym', 'Gimnasio']].map(([v, t]) => `<button data-seg="${key}" data-v="${v}" aria-pressed="${state.seg[key] === v}">${t}</button>`).join('')}</div>`;
}
const linkCard = (id, eb, title) => `<button class="glass pad row between" data-section="${id}" style="width:100%;text-align:left">
      <div><div class="eyebrow">${eb}</div><div style="font-size:16px;font-weight:600;margin-top:3px">${title}</div></div><span class="chev">›</span></button>`;
/* fases (antebrazo) o etapas (gimnasio) con la misma UI */
function stageCards(list, cur, open, kind, word, crit){
  return list.map(f => {
    const cls = f.n < cur ? 'past' : f.n === cur ? 'now' : 'next', isOpen = open === f.n;
    return `<section class="glass phase ${cls} ${isOpen?'open':''}">
        <button class="phase-head" data-${kind}="${f.n}" aria-expanded="${isOpen}" style="width:100%;text-align:left">
          <span class="pn">${f.n}</span>
          <div style="flex:1;min-width:0"><h3>${esc(f.title)}</h3><div class="wk">${inline(f.sub)}</div></div>
          <span class="chev">›</span></button>
        ${isOpen ? `<div class="phase-body md">${phaseBody(f, crit, kind === 'etapa' ? 'g' : '')}</div>
          ${f.n !== cur ? `<div style="margin-top:12px"><button class="btn ghost" data-set${kind}="${f.n}">Estoy en esta ${word}</button></div>` : ''}` : ''}
      </section>`;
  }).join('');
}

function renderPrograma(){
  const s = settings();
  const crit = store.get('crit', {});
  if (state.seg.programa === 'gym'){
    if (state.openEtapa == null) state.openEtapa = s.etapa;
    $view.innerHTML = `
      ${head('Gimnasio · se avanza por criterios', 'Programa')}
      ${segCtl('programa', 'Antebrazo')}
      ${stageCards(gym.etapas, s.etapa, state.openEtapa, 'etapa', 'etapa', crit)}
      ${linkCard('g6', 'Gimnasio · §6', 'Sesiones')}
      ${linkCard('g3', 'Gimnasio · §3', 'Cómo progresar')}
      ${linkCard('g1', 'Gimnasio · §1', 'Cómo encaja con la rehab')}
      <p class="disclaimer">${inline(gym.etapaIntro)}</p>`;
    return;
  }
  if (state.openPhase == null) state.openPhase = s.phase;
  $view.innerHTML = `
    ${head('24 semanas · se avanza por criterios', 'Programa')}
    ${segCtl('programa', 'Antebrazo')}
    ${stageCards(fases, s.phase, state.openPhase, 'phase', 'fase', crit)}
    ${linkCard('8', '§8', 'Semana tipo')}
    ${linkCard('9', '§9', 'Cómo progresar y cuándo frenar')}
    <p class="disclaimer">${inline(faseIntro)}</p>`;
}

/* criterios tildables bajo 'crit': "<fase>:<i>" o, en el gimnasio, "g<etapa>:<i>" */
function phaseBody(f, crit, prefix){
  const wrap = document.createElement('div');
  wrap.innerHTML = md(f.body);
  wrap.querySelectorAll('p > strong:only-child').forEach(st => {
    const t = st.textContent, ul = st.parentElement.nextElementSibling;
    if (/^(Avanzás|Pasás)/.test(t)) {
      st.className = 'lbl-ok';
      if (ul && ul.tagName === 'UL') {
        ul.classList.add('crit');
        [...ul.children].forEach((li, i) => {
          const k = (prefix || '')+f.n+':'+i;
          li.dataset.crit = k;
          li.innerHTML = `<span class="check ${crit[k]?'done':''}"></span><span>${li.innerHTML}</span>`;
        });
      }
    } else if (/^(Retroced|Volvés)/.test(t)) st.className = 'lbl-bad';
    else if (/^Consult/.test(t)) st.className = 'lbl-warn';
  });
  return wrap.innerHTML;
}

const nvids = code => { const n = videosDe(code).length; return n ? [`${n} video${n > 1 ? 's' : ''}`] : []; };
function renderFichas(){
  const li = (f, sub) => `
      <button class="li" data-ficha="${f.code}"><span class="badge ${f.code[0] === 'G' ? 'g' : ''}">${f.code}</span>
        <div style="flex:1;min-width:0"><div class="t">${esc(f.name)}</div><div class="s">${esc(sub)}</div></div><span class="chev">›</span></button>`;
  if (state.seg.fichas === 'gym'){
    const groups = [...new Set(gym.fichas.map(f => f.group))];
    $view.innerHTML = `
      ${head('Veinte ejercicios · gimnasio', 'Fichas')}
      ${segCtl('fichas', 'Recuperación')}
      ${groups.map(g => `<div class="eyebrow group-eb">${esc(g || 'Ejercicios')}</div>
      <section class="glass list">${gym.fichas.filter(f => f.group === g).map(f => li(f, f.tags.concat(nvids(f.code)).join(' · '))).join('')}</section>`).join('')}
      <section class="glass pad md">${md(gym.fichaIntro)}</section>`;
    return;
  }
  $view.innerHTML = `
    ${head('Doce ejercicios · dosis por brazo', 'Fichas')}
    ${segCtl('fichas', 'Recuperación')}
    <section class="glass list">${fichas.map(f => li(f, f.tags.concat(nvids(f.code)).join(' · '))).join('')}
    </section>
    <section class="glass pad md">${md(fichaIntro)}</section>`;
}

/* secciones de la guía: rehab con id "N", gimnasio con id "gN" */
const guiaGroups = () => [{ label:'Recuperación', items:[{ id:'0', n:0, title:'Sobre este plan', body:introMd }].concat(sections.map(s => Object.assign({ id:''+s.n }, s))) }]
  .concat(gym ? [{ label:'Gimnasio', items:[{ id:'g0', n:0, title:'Sobre el plan de fuerza', body:gym.intro }].concat(gym.sections.map(s => Object.assign({ id:'g'+s.n }, s))) }] : []);
function renderGuia(){
  const q = norm(state.q.trim());
  const row = s => {
    let snip = '';
    if (q) { const plain = s.body.replace(/[*`#>|_\[\]]/g, ''); const i = norm(plain).indexOf(q);
      if (i >= 0) snip = esc(plain.slice(Math.max(0, i-40), i)) + '<mark>' + esc(plain.slice(i, i+q.length)) + '</mark>' + esc(plain.slice(i+q.length, i+q.length+60)); }
    return `<button class="li" data-section="${s.id}"><div style="flex:1;min-width:0"><div class="t">${esc(s.title)}</div>${snip?`<div class="s">…${snip}…</div>`:''}</div><small>${s.n?'§'+s.n:''}</small><span class="chev">›</span></button>`;
  };
  const listHtml = guiaGroups().map(g => {
    const hits = q ? g.items.filter(s => norm(s.title + ' ' + s.body).includes(q)) : g.items;
    return hits.length ? `<div class="eyebrow group-eb">${g.label}</div><section class="glass list">${hits.map(row).join('')}</section>` : '';
  }).join('') || '<section class="glass list"><div class="li muted">Sin resultados.</div></section>';

  if ($view.dataset.tab === 'guia' && document.getElementById('q')) { document.getElementById('glist').innerHTML = listHtml; return; }
  $view.innerHTML = `
    ${head('Reglas y retorno', 'Guía')}
    <label class="search glass"><span class="muted" aria-hidden="true">⌕</span><input id="q" type="search" placeholder="${gym ? 'Buscar en los dos planes' : 'Buscar en el plan'}" value="${esc(state.q)}" autocomplete="off"></label>
    <section class="glass pad"><div class="eyebrow">Dolor aceptable, en una frase</div>
      <div class="big">Molestia difusa ≤3–4/10 que no te cambia la técnica, se va en pocas horas y mañana no está.</div></section>
    <section class="glass pad lights">
      <div class="lrow"><span class="lamp" style="background:var(--ok)"></span><div><b>Subís</b><p>Dos sesiones seguidas con técnica correcta y ≤3/10, y a la mañana en tu línea de base. Una sola variable: +0,25–0,5 kg, o +2–3 reps, o +10–20 % de minutos.</p></div></div>
      <div class="lrow"><span class="lamp" style="background:var(--warn)"></span><div><b>Mantenés</b><p>Dolor 3–4/10 durante que se va en horas, o un día malo aislado en una semana que viene bien.</p></div></div>
      <div class="lrow"><span class="lamp" style="background:var(--stop)"></span><div><b>Bajás un escalón</b><p>Dolor &gt;4/10 durante, por encima de tu base a la mañana y 24 h más, dos semanas de dolor en subida, o vuelve el hormigueo.</p></div></div>
    </section>
    <div class="groups" id="glist">${listHtml}</div>`;
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- pantallas de detalle ---------- */
function openSheet(backLabel, html){
  $sheetInner.innerHTML = `<div class="navbar"><button class="chip glass back" data-close>‹ ${backLabel}</button></div>${html}`;
  const wasHidden = $sheet.hidden;
  $sheet.hidden = false;
  if (wasHidden){
    $sheet.scrollTop = 0; $sheet.style.transform = '';
    $sheet.classList.remove('leave'); $sheet.classList.add('enter'); $app.classList.add('pushed');
    $sheet.addEventListener('animationend', function f(e){ if (e.target === $sheet){ $sheet.classList.remove('enter'); $sheet.removeEventListener('animationend', f); } });
  } else {
    $sheet.scrollTo({ top:0, behavior: reduced() ? 'auto' : 'smooth' });
  }
  fixLinks($sheetInner);
}
function closeSheet(animated){
  $app.classList.remove('pushed');
  const done = () => { $sheet.hidden = true; $sheet.classList.remove('leave','enter'); $sheet.style.transform = ''; $sheet.style.removeProperty('--drag'); $sheetInner.innerHTML = ''; };
  if (!animated || $sheet.hidden || reduced()) return done();
  $sheet.classList.remove('enter'); $sheet.classList.add('leave');
  $sheet.addEventListener('animationend', function f(e){ if (e.target === $sheet){ $sheet.removeEventListener('animationend', f); done(); } });
}
const reduced = () => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
const $app = document.querySelector('.app');
const TABS = ['hoy','programa','fichas','guia'];
const $pill = document.getElementById('tabPill');
function movePill(){
  const sel = document.querySelector('.tab[aria-selected="true"]');
  if (!sel) return;
  $pill.style.width = sel.offsetWidth + 'px';
  $pill.style.transform = `translateX(${sel.offsetLeft}px)`;
}
function animateView(dir){
  if (reduced()) return;
  $view.classList.remove('in-r','in-l'); void $view.offsetWidth; $view.classList.add(dir > 0 ? 'in-r' : 'in-l');
}
window.addEventListener('resize', movePill);

/* deslizar desde el borde izquierdo para volver, como en iOS */
(function(){
  let x0 = null, y0 = 0, dx = 0, w = 0, horiz = null;
  $sheet.addEventListener('touchstart', e => { const t = e.touches[0]; if (t.clientX > 28 || (T && (T.steps || (T.gym && T.mode !== 'fin')))) return; x0 = t.clientX; y0 = t.clientY; dx = 0; horiz = null; w = $sheet.offsetWidth; }, { passive:true });
  $sheet.addEventListener('touchmove', e => {
    if (x0 == null) return; const t = e.touches[0];
    if (horiz == null) horiz = Math.abs(t.clientX - x0) > Math.abs(t.clientY - y0);
    if (!horiz) { x0 = null; return; }
    dx = Math.max(0, t.clientX - x0);
    $sheet.style.transform = `translateX(${dx}px)`;
    $app.style.transition = 'none'; $app.style.transform = `translateX(${-22 + 22 * dx / w}%)`; $app.style.opacity = .5 + .5 * dx / w;
  }, { passive:true });
  $sheet.addEventListener('touchend', () => {
    if (x0 == null) return; x0 = null;
    $app.style.transition = $app.style.transform = $app.style.opacity = '';
    if (dx > w * 0.3){ $sheet.style.setProperty('--drag', dx + 'px'); $sheet.style.transform = ''; stopTimer(); render(); closeSheet(true); }
    else { $sheet.style.transition = 'transform .35s cubic-bezier(.32,.72,0,1)'; $sheet.style.transform = ''; setTimeout(() => { $sheet.style.transition = ''; }, 360); }
  });
})();
function fixLinks(root){
  root.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  root.querySelectorAll('table').forEach(t => { if (!t.parentElement.classList.contains('tbl')) { const w = document.createElement('div'); w.className = 'tbl'; t.replaceWith(w); w.appendChild(t); } });
}
/* code: "F4" (recuperación) o "G4" (gimnasio); las flechas se mueven dentro del mismo plan */
function showFicha(code){
  const f = fichaDe(code); if (!f) return;
  const list = code[0] === 'G' ? gym.fichas : fichas, i = list.indexOf(f), prev = list[i-1], next = list[i+1];
  /* semáforo de agarre: 🟢 / 🟡 como tag de color */
  const tags = f.tags.map(t => {
    const m = t.match(/^(🟢|🟡)\s*(.*)$/u);
    if (m) return `<span class="tag ${m[1] === '🟢' ? 'gl-ok' : 'gl-warn'}">${esc(m[2] || (m[1] === '🟢' ? 'Agarre liviano' : 'Agarre medio/alto'))}</span>`;
    return `<span class="tag ${/PRINCIPAL/i.test(t)?'main':''}">${esc(t)}</span>`;
  }).join('');
  const body = f.body.replace(/^- \*\*Dosis\*\* — .*$/m, '');
  const vids = videosDe(code).length;
  openSheet(state.tab === 'hoy' ? 'Hoy' : 'Fichas', `
    <section class="glass hero"><div class="tags"><span class="tag">Ficha ${code[0] === 'G' ? code : f.n} de ${list.length}</span>${tags}</div>
      <h2>${esc(f.name)}</h2><div class="en">${esc(f.en)}</div></section>
    ${f.dose ? `<section class="glass dosecard md"><div class="eyebrow" style="margin-bottom:6px">Dosis</div>${inline(f.dose)}</section>` : ''}
    ${code[0] === 'G' ? `<section class="glass pad" id="ghist">${histCard(code)}</section>` : ''}
    ${vids ? `<section class="videos" id="fvideos" data-code="${code}">${videoCards(code)}</section>` : ''}
    <div class="md cards">${md(body)}</div>
    <div class="row between">
      ${prev ? `<button class="btn ghost" data-ficha="${prev.code}">‹ ${prev.code}</button>` : '<span></span>'}
      ${next ? `<button class="btn ghost" data-ficha="${next.code}">${next.code} ›</button>` : ''}
    </div>`);
}
/* ficha G · "Tu historial": mejor serie (1RM estimado, Epley) de las últimas 8 sesiones; G20 separa reps y tiempo */
function histCard(code){
  const logs = allLogs(), modos = [false, true].map(secs => ({ secs, ses: sesionesDe(logs, code, secs) })).filter(m => m.ses.length);
  if (!modos.length) return `<div class="eyebrow">Tu historial</div><div class="note">Todavía no registraste este ejercicio. Usá ▶ en Hoy.</div>`;
  return modos.map((m, k) => {
    const h = historial(m.ses, 8), vs = h.bars.map(b => b.v), lo = Math.min(...vs), hi = Math.max(...vs);
    const bars = h.bars.map((b, i) => `<div title="${b.date}"><span class="mono">${esc(etiqueta(b.set))}</span><i class="${i === h.bars.length-1 ? 'last' : ''}" style="height:calc((100% - 18px) * ${hi > lo ? (.3 + .7 * (b.v - lo) / (hi - lo)).toFixed(3) : .7})"></i></div>`).join('');
    return `${k ? '<div class="divider"></div>' : ''}<div class="row between"><div class="eyebrow">Tu historial${modos.length > 1 ? (m.secs ? ' · por tiempo' : ' · por reps') : ''}</div>${h.diff != null ? `<span class="upchip ${h.diff > 0 ? '' : 'flat'}">${fmtDiff(h.diff, h.u, m.secs)}</span>` : ''}</div>
      <div class="hchart">${bars}</div>
      <div class="hlist">${h.list.map(x => `<div class="row between"><span class="muted">${fechaCorta(x.date)} ${MESES[+x.date.slice(5,7)-1]}</span><span class="mono">${esc(fmtSets(x.sets))}</span></div>`).join('')}</div>`;
  }).join('');
}
/* validación desde la app: store 'videos' = { [url]: "ok" | "no" }; los "no" van al final */
function videoCards(code){
  const marks = store.get('videos', {});
  const list = videosDe(code).map((v, i) => ({ v, i, m: marks[v.url] })).sort((a, b) => (a.m === 'no') - (b.m === 'no') || a.i - b.i);
  return `<div class="eyebrow" style="padding:0 4px">Videos · se abren en YouTube</div>${list.map(({ v, m }) => { const id = ytId(v.url); return `
    <div class="glass vcard ${m === 'ok' ? 'ok' : m === 'no' ? 'no' : ''}">
      <a class="vlink" href="${esc(v.url)}" target="_blank" rel="noopener" aria-label="Ver video: ${esc(v.titulo || '')}">
        <span class="vthumb">${id ? `<img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : ''}
          <span class="vplay"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg></span>
          ${/[?&]t=/.test(v.url) ? `<span class="vtag">Arranca en el minuto justo</span>` : ''}
          ${m === 'ok' ? '<span class="vok"><span class="check done" aria-label="Sirve"></span></span>' : ''}</span>
        <span class="vt">${esc(v.titulo || v.url)}<span class="vext" aria-hidden="true">↗</span></span>
      </a>
      <div class="vmeta">${esc([v.canal, v.idioma === 'es' ? 'Español' : v.idioma === 'en' ? 'Inglés' : v.idioma].filter(Boolean).join(' · '))}</div>
      ${v.nota ? `<p class="vnote">${esc(v.nota)}</p>` : ''}
      <div class="row vbtns">
        <button class="vbtn" data-vurl="${esc(v.url)}" data-vmark="ok" aria-pressed="${m === 'ok'}">Sirve</button>
        <button class="vbtn" data-vurl="${esc(v.url)}" data-vmark="no" aria-pressed="${m === 'no'}">No sirve</button>
      </div>
    </div>`; }).join('')}`;
}
const ytId = u => (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1];
function markVideo(url, mark){
  const marks = store.get('videos', {});
  if (marks[url] === mark) delete marks[url]; else marks[url] = mark;
  store.set('videos', marks);
  const sec = document.getElementById('fvideos');
  if (sec) sec.innerHTML = videoCards(sec.dataset.code);
}
function showSection(id){
  const g = id[0] === 'g', s = guiaGroups()[g ? 1 : 0].items.find(x => x.id === id);
  if (!s) return;
  const back = state.tab === 'programa' ? 'Programa' : 'Guía';
  const eb = [g ? 'Gimnasio' : '', s.n ? '§'+s.n : ''].filter(Boolean).join(' · ');
  openSheet(back, `<div>${eb?`<div class="eyebrow">${eb}</div>`:''}<h1 class="large" style="font-size:30px;text-wrap:balance">${esc(s.title)}</h1></div>
    <section class="glass pad md">${md(s.body)}</section>`);
}
function showSettings(){
  const s = settings();
  const fasesDe = (ETAPA_FASE[s.etapa] || []).join('–');
  openSheet('Hoy', `
    <div><h1 class="large">Ajustes</h1></div>
    <section class="glass pad">
      <div class="eyebrow">Fase actual</div>
      <div class="seg" style="margin-top:10px">${[0,1,2,3,4].map(p => `<button data-setphase="${p}" aria-pressed="${s.phase===p}">${p}</button>`).join('')}</div>
      <div class="note">${esc(fases.find(f => f.n === s.phase)?.title || '')}. Se avanza por criterios, no por calendario: mirá la pestaña Programa.</div>
      <label class="field" style="margin-top:12px"><span>Inicio del plan</span><input id="start" type="date" value="${s.start}"></label>
      <div class="note">Se usa para calcular la semana (hoy: semana ${weekOf(todayIso)}).</div>
    </section>
    ${gym ? `<section class="glass pad">
      <div class="eyebrow">Etapa del gimnasio</div>
      <div class="seg" style="margin-top:10px">${[1,2,3,4].map(p => `<button data-setetapa="${p}" aria-pressed="${s.etapa===p}">${p}</button>`).join('')}</div>
      <div class="note">${esc(gym.etapas.find(e => e.n === s.etapa)?.title || '')}. Corresponde a la Fase ${fasesDe} del antebrazo.</div>
      ${etapaOk(s) ? '' : `<div class="note alert">Estás en Fase ${s.phase} del antebrazo: esta etapa va con la Fase ${fasesDe}. Revisá los criterios en Programa antes de sumar carga.</div>`}
    </section>` : ''}
    <section class="glass pad">
      <div class="eyebrow">Copia de seguridad</div>
      <div class="note">Guarda en un archivo .json tus registros de dolor, tildes, cargas del gimnasio, peso corporal, criterios, fase, etapa del gimnasio, fecha de inicio y la validación de los videos. Si perdés la web o cambiás de teléfono, lo restaurás desde acá.</div>
      <div class="note" style="margin-top:4px">${backupAge()}</div>
      <div class="row" style="flex-wrap:wrap;margin-top:14px">
        <button class="btn" data-export>Guardar backup</button>
        <label class="btn ghost" for="restoreFile" style="cursor:pointer">Restaurar</label>
        <input id="restoreFile" class="sr" type="file" accept="application/json,.json">
        <button class="btn ghost" data-copy>Copiar</button>
      </div>
      <div id="backupMsg" aria-live="polite"></div>
    </section>`);
}

/* ---------- backup ---------- */
const PREFIX = 'ab24:';
let pendingRestore = null;
function collect(){
  const data = Object.assign({}, mem);
  try{ for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k.startsWith(PREFIX)) data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } }catch(e){}
  return data;
}
function summary(data){
  const days = Object.keys(data).filter(k => k.startsWith('log:')).sort();
  const s = data.settings || {};
  return `${days.length} día${days.length === 1 ? '' : 's'} registrado${days.length === 1 ? '' : 's'}${days.length ? ` (${days[0].slice(4)} a ${days[days.length-1].slice(4)})` : ''} · fase ${s.phase ?? '—'}${s.etapa ? ` · etapa ${s.etapa}` : ''}`;
}
function backupAge(){
  const t = store.get('lastBackup', null);
  if (!t) return 'Todavía no guardaste ningún backup.';
  const d = Math.floor((Date.now() - new Date(t)) / 864e5);
  return 'Último backup: ' + (d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`) + '.';
}
function backupText(){
  return JSON.stringify({ app:'antebrazos24', version:1, exportedAt:new Date().toISOString(), data:collect() }, null, 2);
}
function backupMsg(html, kind){
  const el = document.getElementById('backupMsg');
  if (el) el.innerHTML = `<div class="note" style="margin-top:12px;color:var(--${kind === 'bad' ? 'stop' : kind === 'ok' ? 'ok' : 'ink-2'})">${html}</div>`;
}
async function exportBackup(){
  store.set('lastBackup', new Date().toISOString());
  const text = backupText(), name = `antebrazos24-backup-${todayIso}.json`;
  let file = null;
  try{ file = new File([text], name, { type:'application/json' }); }catch(e){}
  try{
    if (file && navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file], title:'Backup Antebrazos 24' });
      showSettings(); return backupMsg('Backup listo. En iPhone elegí "Guardar en Archivos" para tenerlo a mano.', 'ok');
    }
  }catch(e){ if (e && e.name === 'AbortError'){ return; } }
  try{
    const url = URL.createObjectURL(file || new Blob([text], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }catch(e){}
  showSettings();
  backupMsg(`Descargado como <span class="mono">${name}</span>. Si no aparece el archivo, tocá Copiar y pegalo en una nota.`, 'ok');
}
function copyBackup(){
  const text = backupText();
  const fallback = () => backupMsg('No se pudo copiar automáticamente. Seleccioná el texto y copialo:<textarea class="mono" style="width:100%;height:120px;margin-top:8px;font-size:11px;border-radius:12px;border:0;background:var(--fill);color:var(--ink);padding:8px" readonly>' + esc(text) + '</textarea>');
  try{ navigator.clipboard.writeText(text).then(() => { store.set('lastBackup', new Date().toISOString()); backupMsg('Copiado. Pegalo en una nota o mandátelo por mail.', 'ok'); }, fallback); }catch(e){ fallback(); }
}
function readRestore(file){
  const r = new FileReader();
  r.onload = () => {
    let p = null;
    try{ p = JSON.parse(r.result); }catch(e){}
    if (!p || p.app !== 'antebrazos24' || !p.data || typeof p.data !== 'object'){
      pendingRestore = null;
      return backupMsg('Ese archivo no es un backup de Antebrazos 24. Elegí el .json que guardaste desde esta pantalla.', 'bad');
    }
    pendingRestore = p.data;
    const when = p.exportedAt ? new Date(p.exportedAt).toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' }) : '¿?';
    backupMsg(`<b style="color:var(--ink)">Backup del ${when}</b><br>${summary(p.data)}<br>Reemplaza lo que hay ahora en este teléfono (${summary(collect())}).
      <div class="row" style="margin-top:10px"><button class="btn" data-restore-ok>Restaurar</button><button class="btn ghost" data-restore-cancel>Cancelar</button></div>`);
  };
  r.onerror = () => backupMsg('No se pudo leer el archivo.', 'bad');
  r.readAsText(file);
}
function applyRestore(){
  const data = pendingRestore; pendingRestore = null;
  if (!data) return;
  try{ Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); }catch(e){}
  Object.keys(mem).forEach(k => delete mem[k]);
  Object.entries(data).forEach(([k, v]) => store.set(k, v));
  state.openPhase = state.openEtapa = null;
  render(); showSettings();
  backupMsg('Restaurado: ' + summary(data) + '.', 'ok');
}

/* ---------- timer ---------- */
let T = null;
let audio = null;
function beep(freq, dur, when){
  if (!settings().sound || !audio) return;
  try{
    const t0 = audio.currentTime + (when || 0), o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }catch(e){}
}
function buildSteps(c){
  const steps = [{ kind:'prep', label:'Preparate', dur:5, set:1 }];
  for (let s = 1; s <= c.sets; s++){
    if (c.hold) steps.push({ kind:'work', label:c.holdLabel, dur:c.hold, set:s });
    else for (let r = 1; r <= c.reps; r++) c.tempo.forEach(([label, dur], k) => steps.push({ kind:'work', label, dur, set:s, rep:r, phase:k }));
    if (s < c.sets) steps.push({ kind:'rest', label:'Descansá', dur:c.rest, set:s+1 });
  }
  return steps;
}
function showTimerSetup(i){
  const it = PLAN[settings().phase](parseIso(state.date).getDay()).items[i];
  const sp = it.spec;
  T = { idx:i, f:it.f, name:F[it.f], dose:it.dose, sets:sp.sets, reps:sp.reps || 0, hold:sp.hold || 0, rest:sp.rest,
        tempo: sp.tempo || TEMPO[it.f] || [['Subí',2],['Bajá',3]], holdLabel: HOLD_LABEL[it.f] || 'Sostené', running:false };
  renderTimerSetup();
}
function renderTimerSetup(){
  const c = T, unit = c.hold ? 's' : 'reps';
  const stepper = (k, label, val, step) => `<div class="field"><span>${label}</span><div class="stepper"><button data-tcfg="${k}" data-d="${-step}" aria-label="Menos">−</button><output class="mono">${val}</output><button data-tcfg="${k}" data-d="${step}" aria-label="Más">+</button></div></div>`;
  const per = c.hold ? c.hold : c.reps * c.tempo.reduce((a, t) => a + t[1], 0);
  const total = 5 + c.sets * per + (c.sets - 1) * c.rest;
  openSheet('Hoy', `
    <section class="glass hero"><div class="tags"><span class="tag">F${c.f}</span><span class="tag">Por brazo</span></div>
      <h2>${esc(c.name)}</h2><div class="en mono" style="font-style:normal">${esc(c.dose)}</div></section>
    <section class="glass pad cfg">
      ${stepper('sets', 'Series', c.sets, 1)}
      ${c.hold ? stepper('hold', 'Segundos por serie', c.hold, 5) : stepper('reps', 'Repeticiones', c.reps, 1)}
      ${stepper('rest', 'Descanso (s)', c.rest, 15)}
      ${c.hold ? '' : `<div class="field"><span>Tempo</span><span class="mono muted" style="font-size:13px;text-align:right">${c.tempo.map(t => esc(t[0]) + ' ' + t[1] + ' s').join(' · ')}</span></div>`}
      <div class="field"><span>Sonido</span><button class="chip" style="background:var(--fill)" data-sound>${settings().sound ? 'Activado' : 'Silenciado'}</button></div>
    </section>
    <div class="row between"><span class="muted">≈ ${Math.round(total/60)} min · ${c.sets} serie${c.sets>1?'s':''} de ${c.hold ? c.hold+' s' : c.reps+' '+unit}</span>
      <button class="btn" data-tstart>Empezar</button></div>
    <p class="disclaimer">Hacé ambos brazos. Si el dolor pasa de 4/10 durante, pará y bajá carga.</p>`);
}
function startTimer(){
  try{ audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); }catch(e){ audio = null; }
  try{ navigator.wakeLock && navigator.wakeLock.request('screen').then(l => { T.lock = l; }).catch(() => {}); }catch(e){}
  Object.assign(T, { steps: buildSteps(T), i:0, running:true, elapsed:0, last:performance.now() });
  openSheet('Salir', `<section class="glass tm-stage" id="tm">
      <div class="tm-pills" id="tmPills">${[...Array(T.sets)].map(() => '<span></span>').join('')}</div>
      <div class="tm-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" stroke="var(--fill)"/><circle class="tm-arc" id="tmArc" cx="60" cy="60" r="52" stroke-dasharray="0 999"/></svg>
        <div class="tm-center"><div class="tm-label" id="tmLabel"></div><div class="tm-num" id="tmNum"></div><div class="tm-sub" id="tmSub"></div></div></div>
      <div class="tm-next" id="tmNext"></div>
    </section>
    <div class="tm-ctrl">
      <button class="round" data-tback aria-label="Paso anterior"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 6.2v11.6a1 1 0 0 1-1.5.86L9.6 13a1.2 1.2 0 0 1 0-2l8.9-5.6a1 1 0 0 1 1.5.8Z"/></svg></button>
      <button class="round main" data-tpause aria-label="Pausar" id="tmPause"></button>
      <button class="round" data-tskip aria-label="Saltar paso"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 6.2v11.6a1 1 0 0 0 1.5.86L14.4 13a1.2 1.2 0 0 0 0-2L5.5 5.4A1 1 0 0 0 4 6.2Z"/></svg></button>
    </div>`);
  stepChanged(); tick();
}
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" style="margin-left:3px"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
function stepChanged(){
  const st = T.steps[T.i];
  if (st.kind === 'work') beep(st.phase === 0 || st.phase == null ? 880 : 660, 0.12);
  if (st.kind === 'rest') beep(520, 0.25);
  T.warned = {};
}
function tick(){
  if (!T || !T.steps || !document.getElementById('tm')) return;
  const now = performance.now();
  if (T.running) T.elapsed += (now - T.last) / 1000;
  T.last = now;
  let st = T.steps[T.i];
  while (T.elapsed >= st.dur){
    T.elapsed -= st.dur; T.i++;
    if (T.i >= T.steps.length) return finishTimer();
    st = T.steps[T.i]; stepChanged();
  }
  const left = Math.ceil(st.dur - T.elapsed);
  if (st.kind !== 'work' && left <= 3 && !T.warned[left]){ T.warned[left] = 1; beep(1040, 0.08); }
  const tm = document.getElementById('tm');
  tm.className = 'glass tm-stage tm-' + st.kind;
  const C = 2 * Math.PI * 52;
  document.getElementById('tmArc').setAttribute('stroke-dasharray', `${C * (1 - T.elapsed / st.dur)} ${C}`);
  document.getElementById('tmLabel').textContent = st.label;
  document.getElementById('tmNum').textContent = left;
  document.getElementById('tmSub').textContent = st.kind === 'rest' ? `Sigue la serie ${st.set} de ${T.sets}`
    : st.kind === 'prep' ? `${T.sets} series · ${T.hold ? T.hold + ' s' : T.reps + ' reps'}`
    : `Serie ${st.set} de ${T.sets}` + (st.rep ? ` · Rep ${st.rep} de ${T.reps}` : '');
  const nx = T.steps[T.i + 1];
  document.getElementById('tmNext').textContent = nx ? (nx.kind === 'rest' ? `Después: descanso ${nx.dur} s` : st.kind !== 'work' ? `Después: ${nx.label}` : '') : 'Último tramo';
  [...document.getElementById('tmPills').children].forEach((p, k) => p.className = k + 1 < st.set ? 'done' : k + 1 === st.set ? 'cur' : '');
  document.getElementById('tmPause').innerHTML = T.running ? ICON_PAUSE : ICON_PLAY;
  T.raf = requestAnimationFrame(tick);
}
function jump(d){
  const cur = T.steps[T.i];
  if (d > 0){ /* saltar al próximo cambio de serie o descanso */
    let j = T.i + 1;
    if (cur.kind === 'work') while (j < T.steps.length && T.steps[j].kind === 'work' && T.steps[j].set === cur.set) j++;
    if (j >= T.steps.length) return finishTimer();
    T.i = j;
  } else {
    if (T.elapsed < 1.5 && T.i > 0) T.i--;
  }
  T.elapsed = 0; stepChanged();
}
function finishTimer(){
  cancelAnimationFrame(T.raf);
  beep(880, 0.15); beep(1175, 0.15, 0.18); beep(1568, 0.3, 0.36);
  try{ T.lock && T.lock.release(); }catch(e){}
  const L = log(state.date), c = L.checks || {}; c[T.idx] = true; setLog(state.date, { checks:c });
  const name = T.name; T = null;
  openSheet('Hoy', `<section class="glass tm-stage tm-rest"><div class="tm-label" style="font-size:28px">Listo</div>
    <div class="tm-sub">${esc(name)} quedó marcado como hecho.</div>
    <div class="note">Si es el primer brazo, repetí con el otro.</div></section>
    <div class="row" style="justify-content:center"><button class="btn" data-close>Volver a Hoy</button></div>`);
}
function stopTimer(){ if (T){ cancelAnimationFrame(T.raf); try{ T.lock && T.lock.release(); }catch(e){} } T = null; }

/* ---------- series del gimnasio ---------- */
/* T.gym: serie → (superserie | descanso) → serie … → resumen; las series van a log.sets[código] */
const mmss = s => `${Math.floor(s/60)}:${pad2(Math.round(s) % 60)}`;
const gItem = code => T.ses.items.find(it => it.g === code);
const gCount = code => setsDia(code, gItem(code).secs, T.date).length;
/* superserie: los dos ejercicios en el orden de la sesión */
function gBlock(code){
  const it = gItem(code), p = it.ss && gItem(it.ss);
  if (!p || p.ss !== code) return [it];
  return T.ses.items.indexOf(it) < T.ses.items.indexOf(p) ? [it, p] : [p, it];
}
/* qué viene después de anotar (plus = 1: suponiendo la serie actual ya anotada) */
function gNext(code, plus){
  const cnt = c => gCount(c) + (c === code ? plus : 0), blk = gBlock(code), rest = blk[blk.length-1].rest;
  if (blk.length === 2 && blk[0].g === code && cnt(blk[1].g) < blk[1].sets) return { code: blk[1].g, rest: 0 };
  const pend = blk.find(x => cnt(x.g) < x.sets);
  if (pend) return { code: pend.g, rest };
  const items = T.ses.items.filter(x => x.g), gl = log(T.date).gym || {}, from = items.indexOf(blk[blk.length-1]);
  const nx = items.slice(from + 1).concat(items.slice(0, from)).find(x => !gl[x.g] && !blk.includes(x));
  return nx ? { code: nx.g, rest, nuevo: true } : { fin: true };
}
function startGym(code){
  const s = settings();
  try{ audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); }catch(e){ audio = null; }
  T = { gym: true, ses: gymDay(s.etapa, parseIso(state.date).getDay()), date: state.date, etapa: s.etapa };
  try{ navigator.wakeLock && navigator.wakeLock.request('screen').then(l => { if (T && T.gym) T.lock = l; else l.release(); }).catch(() => {}); }catch(e){}
  if (gItem(code)) showSerie(code);
}
function gPrev(code, secs){ const p = previas(code, secs, T.date); return p.length ? p[p.length-1] : null; }
const soundChip = () => `<div class="row" style="justify-content:center"><button class="chip" style="background:var(--fill)" data-sound id="gsound">Sonido: ${settings().sound ? 'activado' : 'silenciado'}</button></div>`;
function showSerie(code){
  cancelAnimationFrame(T.raf); T.clock = null;
  const it = gItem(code), f = fichaDe(code) || { name: code, tags: [], body: '' }, secs = !!it.secs, range = it.reps || it.secs, eq = eqDe(code);
  const hoy = setsDia(code, secs, T.date), prev = gPrev(code, secs), k = hoy.length;
  const prog = progresion(prev && prev.sets, range, eq, secs);
  Object.assign(T, { mode: 'serie', code, prog, edit: null, cur: precarga(k, prev ? prev.sets : [], hoy, prog, range, eq, secs ? 'bw' : unidad(code)) });
  const yellow = f.tags.some(t => t.startsWith('🟡')), p = it.ss && gItem(it.ss);
  const det = [yellow ? 'straps puestos' : '', it.lado ? (/por pierna/.test(it.dose) ? 'por pierna' : 'por lado') : '']
    .concat(it.dose.split(' · ').filter(x => !/\d+×|^\d+\s*s$|superserie/.test(x)))
    .concat([p ? `superserie con ${p.g} ${(fichaDe(p.g) || {}).name || ''}` : '', T.etapa === 1 ? '3 en reserva' : yellow ? 'nunca al fallo' : '']).filter(Boolean);
  const progLine = (f.body.match(/^- \*\*Progresión\*\* — (.*)$/m) || [])[1];
  const pills = [...Array(Math.max(it.sets, k + 1))].map((_, i) => `<span class="${i < k ? 'done' : i === k ? 'cur' : ''}"></span>`).join('');
  openSheet('Salir', `<div class="tm-pills" aria-hidden="true">${pills}</div>
    <section class="glass pad gs-goal"><div class="eyebrow">${code} · ${esc(f.name)} · serie ${k + 1}${k < it.sets ? ' de ' + it.sets : ' · extra'}</div>
      <div class="gs-range">${range[0] === range[1] ? range[0] : range[0] + '–' + range[1]}${secs ? '<small>s</small>' : ''}</div>
      ${det.length ? `<div class="gs-det">${esc(det.join(' · '))}</div>` : ''}</section>
    <section class="glass pad row between gs-last">
      <div><div class="eyebrow">Última vez${prev ? ' · ' + fechaCorta(prev.date) : ''}</div><div class="mono gs-sets">${prev ? esc(fmtSets(prev.sets)) : 'Primera vez'}</div></div>
      <div style="text-align:right"><div class="eyebrow">Hoy</div><div class="mono gs-sets" id="ghoy">${hoy.length ? esc(fmtSets(hoy)) : '—'}</div></div></section>
    ${prog ? `<section class="glass pad gs-up"><div class="eyebrow">${prog.kind === 'peso' ? 'Subí peso' : prog.kind === 'reps' ? 'Sumá reps' : 'Paso siguiente'}</div>
      <div class="gs-uptext">${esc(prog.text)}</div>${prog.kind === 'variante' && progLine ? `<div class="note">${inline(progLine)}</div>` : ''}</section>` : ''}
    <section class="glass pad cfg" id="gform">${gForm()}</section>
    <button class="btn gs-done" data-gdone id="gdone">${gDoneLabel()}</button>
    <section class="glass pad" id="gsets"${gSetsList() ? '' : ' hidden'}>${gSetsList()}</section>
    ${soundChip()}`);
}
function gForm(){
  const c = T.cur, it = gItem(T.code), eq = eqDe(T.code);
  const st = (k, label, val) => `<div class="stepper"><button data-gst="${k}" data-d="-1" aria-label="Menos ${label}">−</button><output class="mono">${val}</output><button data-gst="${k}" data-d="1" aria-label="Más ${label}">+</button></div>`;
  const peso = it.secs ? ''
    : c.u === 'bw' ? `<div class="field"><span>Lastre <span class="muted">opcional</span></span>${st('w', 'lastre', c.w ? num(c.w) + ' kg' : 'sin')}</div>`
    : `<div class="field"><div><div>Peso</div><div class="seg useg">${['kg', 'placas'].map(u => `<button data-gu="${u}" aria-pressed="${c.u === u}">${u}</button>`).join('')}</div></div>${st('w', 'peso', fmtW(c.w, c.u))}</div>`;
  return peso + `<div class="field"><span>${it.secs ? 'Segundos' : 'Reps'}</span>${st('r', it.secs ? 'segundos' : 'reps', it.secs ? c.r + ' s' : c.r)}</div>`;
}
function gDoneLabel(){
  if (gItem(T.code).secs) return `Empezar · ${mmss(T.cur.r)}`;
  const nx = gNext(T.code, 1);
  return nx.fin ? 'Serie hecha · terminar' : !nx.rest ? `Serie hecha · sigue ${nx.code}` : `Serie hecha · descanso ${mmss(nx.rest)}`;
}
/* series anotadas hoy del ejercicio (o de la superserie), con editar y borrar */
function gSetsList(){
  const codes = gBlock(T.code).map(x => x.g), all = log(T.date).sets || {};
  const rows = codes.flatMap(c => (all[c] || []).map((s, i) => ({ c, s, i })));
  if (!rows.length) return '';
  const mini = (k, val) => `<div class="stepper sm"><button data-gest="${k}" data-d="-1" aria-label="Menos">−</button><output class="mono">${val}</output><button data-gest="${k}" data-d="1" aria-label="Más">+</button></div>`;
  return `<div class="eyebrow">Anotadas hoy</div>` + rows.map(({ c, s, i }) => {
    const lbl = `${codes.length > 1 ? c + ' · ' : ''}S${i + 1}`;
    if (T.edit && T.edit.c === c && T.edit.i === i) return `<div class="gset"><span class="muted mono">${lbl}</span>${s.secs ? '' : mini('w', s.u === 'bw' ? (s.w ? '+' + num(s.w) + ' kg' : 'sin') : fmtW(s.w, s.u))}${mini('r', fmtR(s))}<button class="vbtn" data-gedit="">Listo</button></div>`;
    return `<div class="gset"><span class="muted mono">${lbl}</span><span class="mono" style="flex:1;min-width:0">${esc(fmtSets([s]))}</span><button class="vbtn" data-gedit="${c}:${i}">Editar</button><button class="vbtn del" data-gdel="${c}:${i}">Borrar</button></div>`;
  }).join('');
}
function gRefresh(){
  const el = document.getElementById('gsets'); if (!el) return;
  const h = gSetsList(); el.innerHTML = h; el.hidden = !h;
  const hoy = document.getElementById('ghoy'); if (hoy){ const a = setsDia(T.code, gItem(T.code).secs, T.date); hoy.textContent = a.length ? fmtSets(a) : '—'; }
  const b = document.getElementById('gdone'); if (b) b.textContent = gDoneLabel();
}
function logSet(s){
  const all = Object.assign({}, log(T.date).sets);
  all[T.code] = (all[T.code] || []).concat([s]);
  setLog(T.date, { sets: all });
}
function afterSet(){
  const gl = Object.assign({}, log(T.date).gym);
  gBlock(T.code).forEach(x => { if (gCount(x.g) >= x.sets) gl[x.g] = true; });
  setLog(T.date, { gym: gl });
  const nx = gNext(T.code, 0);
  if (nx.fin) return showResumen();
  if (!nx.rest) return showSerie(nx.code);
  showRest(nx);
}
const ringHtml = (label, num, sub) => `<div class="tm-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" stroke="var(--fill)"/><circle class="tm-arc" id="tmArc" cx="60" cy="60" r="52" stroke-dasharray="999 999"/></svg>
  <div class="tm-center"><div class="tm-label" id="tmLabel">${label}</div><div class="tm-num" id="tmNum">${num}</div><div class="tm-sub" id="tmSub">${sub}</div></div></div>`;
function showRest(nx){
  Object.assign(T, { mode: 'rest', next: nx, edit: null });
  openSheet('Salir', `<section class="glass tm-stage tm-rest" id="tm">${ringHtml('Descansá', mmss(nx.rest), 'de ' + mmss(nx.rest))}</section>
    <div class="tm-ctrl"><button class="round txt" data-grest="-15" aria-label="Quince segundos menos">−15 s</button><button class="round main txt" data-gskip>Saltar</button><button class="round txt" data-grest="15" aria-label="Quince segundos más">+15 s</button></div>
    <section class="glass pad" id="gsets">${gSetsList()}</section>
    ${sigueCard(nx)}
    ${soundChip()}`);
  beep(520, 0.25);
  T.clock = { kind: 'rest', dur: nx.rest, el: 0, last: performance.now(), running: true, warned: {}, done: () => { beep(880, 0.15); beep(1175, 0.2, 0.18); showSerie(nx.code); } };
  gTick();
}
function sigueCard(nx){
  const it = gItem(nx.code), k = gCount(nx.code), prev = gPrev(nx.code, it.secs), up = progDe(it, T.date);
  const last = prev && (!nx.nuevo && prev.sets[k] ? [prev.sets[k]] : prev.sets);
  return `<section class="glass pad"><div class="eyebrow">Sigue</div>
    <div class="gs-next">${nx.code} · ${esc((fichaDe(nx.code) || {}).name || '')}${up ? '<span class="upchip">↑ Subí</span>' : ''}</div>
    <div class="note" style="margin-top:3px">Serie ${k + 1}${k < it.sets ? ' de ' + it.sets : ' · extra'} · ${esc(it.dose.replace(/ · superserie$/, ''))}</div>
    <div class="note" style="margin-top:3px">${prev ? `Última vez (${fechaCorta(prev.date)}): <span class="mono">${esc(fmtSets(last))}</span>` : 'Sin registros anteriores.'}</div></section>`;
}
/* series por tiempo (plancha lateral): 5 s para acomodarse y la cuenta regresiva de los segundos elegidos */
function startHold(){
  const it = gItem(T.code), secs = T.cur.r, k = gCount(T.code);
  T.mode = 'hold';
  openSheet('Salir', `<section class="glass tm-stage tm-prep" id="tm">${ringHtml('Preparate', 5, `${T.code} · serie ${k + 1} de ${it.sets} · ${secs} s`)}</section>
    <div class="tm-ctrl">
      <button class="round" data-ghcancel aria-label="Cancelar la serie"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <button class="round main" data-ghpause aria-label="Pausar" id="tmPause">${ICON_PAUSE}</button>
      <button class="round" data-ghstop aria-label="Terminar acá"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 6.2v11.6a1 1 0 0 0 1.5.86L14.4 13a1.2 1.2 0 0 0 0-2L5.5 5.4A1 1 0 0 0 4 6.2Z"/></svg></button>
    </div>
    <p class="disclaimer">Terminar acá anota los segundos que llevás.</p>`);
  const work = () => {
    beep(880, 0.12);
    document.getElementById('tm').className = 'glass tm-stage tm-work';
    document.getElementById('tmLabel').textContent = 'Sostené';
    T.clock = { kind: 'hold', dur: secs, el: 0, last: performance.now(), running: true, warned: {}, done: () => holdDone(secs) };
    gTick();
  };
  T.clock = { kind: 'prep', dur: 5, el: 0, last: performance.now(), running: true, warned: {}, done: work };
  gTick();
}
function holdDone(secs){ T.clock = null; cancelAnimationFrame(T.raf); beep(1175, 0.2); logSet({ w: 0, u: 'bw', r: secs, secs: true }); afterSet(); }
function gTick(){
  const c = T && T.gym && T.clock; if (!c || !document.getElementById('tm')) return;
  const now = performance.now();
  if (c.running) c.el += (now - c.last) / 1000;
  c.last = now;
  const left = c.dur - c.el;
  if (left <= 0){ T.clock = null; return c.done(); }
  const s = Math.ceil(left);
  if (c.kind !== 'hold' && s <= 3 && !c.warned[s]){ c.warned[s] = 1; beep(1040, 0.08); }
  const C = 2 * Math.PI * 52;
  document.getElementById('tmArc').setAttribute('stroke-dasharray', `${C * left / c.dur} ${C}`);
  document.getElementById('tmNum').textContent = c.kind === 'rest' ? mmss(s) : s;
  const pb = document.getElementById('tmPause'); if (pb) pb.innerHTML = c.running ? ICON_PAUSE : ICON_PLAY;
  T.raf = requestAnimationFrame(gTick);
}
const gpainNote = v => v == null ? 'Tocá la molestia máxima que sentiste en el antebrazo durante la sesión.'
  : v <= 3 ? 'Dentro de lo aceptable (≤3/10).'
  : 'Por encima de 3/10: la próxima vez, en cuanto pase, cambiá a la alternativa de la ficha («Si molesta el antebrazo»). Si mañana amanecés por encima de tu base, 2 series en vez de 3 en los 🟡 y sin subir peso esa semana (§1).';
function showResumen(){
  cancelAnimationFrame(T.raf); T.clock = null; T.mode = 'fin';
  try{ T.lock && T.lock.release(); }catch(e){} T.lock = null;
  beep(880, 0.15); beep(1175, 0.15, 0.18); beep(1568, 0.3, 0.36);
  const L = log(T.date); let total = 0;
  const rows = T.ses.items.filter(it => it.g).map(it => {
    const hoy = setsDia(it.g, it.secs, T.date); if (!hoy.length) return '';
    total += hoy.length;
    const u = hoy[0].u, prev = (gPrev(it.g, it.secs) || { sets: [] }).sets.filter(s => s.u === u), mx = a => Math.max(...a.filter(s => s.u === u).map(s => s.w));
    const d = prev.length && !it.secs ? mx(hoy) - mx(prev) : 0;
    return `<div class="li"><span class="badge g">${it.g}</span><div style="flex:1;min-width:0"><div class="t">${esc((fichaDe(it.g) || {}).name || it.g)}${d > 0 ? `<span class="upchip">↑ +${u === 'placas' ? fmtW(d, u) : num(d) + ' kg'}</span>` : ''}</div>
      <div class="s mono">${hoy.length} serie${hoy.length > 1 ? 's' : ''} · ${esc(fmtSets(hoy))}</div></div></div>`;
  }).join('');
  openSheet('Hoy', `<section class="glass tm-stage tm-rest"><div class="tm-label" style="font-size:28px">Sesión terminada</div>
      <div class="tm-sub">${esc(T.ses.label)} · ${total} serie${total === 1 ? '' : 's'}</div></section>
    ${rows ? `<section class="glass list">${rows}</section>` : ''}
    <section class="glass pad"><div class="eyebrow">Molestia máxima de antebrazo durante el gimnasio</div>
      <div class="scale" id="gpainScale">${scale('gpain', L.gymPain)}</div><div class="note" id="gpainNote">${gpainNote(L.gymPain)}</div></section>
    <div class="row" style="justify-content:center"><button class="btn" data-close>Volver a Hoy</button></div>`);
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-crit],[data-fold]'); if (!t) return;
  const ds = t.dataset;
  if (ds.tab){
    const from = TABS.indexOf(state.tab), to = TABS.indexOf(ds.tab);
    t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    if (from === to){ if (!$sheet.hidden){ stopTimer(); render(); closeSheet(true); } else window.scrollTo({ top:0, behavior:'smooth' }); return; }
    state.tab = ds.tab; stopTimer(); closeSheet(!$sheet.hidden);
    animateView(to - from); try{ history.replaceState(null, '', '#'+ds.tab); }catch(_){} $view.dataset.tab=''; render(); window.scrollTo(0,0); return; }
  if ('close' in ds){ stopTimer(); render(); closeSheet(true); return; }
  if ('export' in ds){ exportBackup(); return; }
  if ('copy' in ds){ copyBackup(); return; }
  if ('restoreOk' in ds){ applyRestore(); return; }
  if ('restoreCancel' in ds){ pendingRestore = null; backupMsg(''); return; }
  if (ds.timer != null){ showTimerSetup(+ds.timer); return; }
  if (ds.tcfg){ const min = { sets:1, reps:1, hold:5, rest:0 }[ds.tcfg]; T[ds.tcfg] = Math.max(min, T[ds.tcfg] + +ds.d); renderTimerSetup(); return; }
  if ('sound' in ds){ store.set('settings', Object.assign(settings(), { sound: !settings().sound })); if (T && T.gym) t.textContent = 'Sonido: ' + (settings().sound ? 'activado' : 'silenciado'); else renderTimerSetup(); return; }
  if (ds.gplay){ startGym(ds.gplay); return; }
  if (ds.gst){ const c = T.cur, it = gItem(T.code);
    if (ds.gst === 'w') c.w = stepPeso(eqDe(T.code), c.u, c.w, +ds.d); else c.r = Math.max(it.secs ? 5 : 1, c.r + +ds.d * (it.secs ? 5 : 1));
    document.getElementById('gform').innerHTML = gForm(); document.getElementById('gdone').textContent = gDoneLabel(); return; }
  if (ds.gu){ store.set('units', Object.assign(store.get('units', {}), { [T.code]: ds.gu }));
    const it = gItem(T.code), prev = gPrev(T.code, it.secs);
    T.cur = precarga(gCount(T.code), prev ? prev.sets : [], setsDia(T.code, it.secs, T.date), T.prog, it.reps || it.secs, eqDe(T.code), ds.gu);
    document.getElementById('gform').innerHTML = gForm(); return; }
  if ('gdone' in ds){ if (gItem(T.code).secs) startHold(); else { logSet({ w: T.cur.w, u: T.cur.u, r: T.cur.r }); afterSet(); } return; }
  if (ds.gedit != null){ const [c, i] = ds.gedit.split(':'); T.edit = ds.gedit ? { c, i: +i } : null; gRefresh(); return; }
  if (ds.gest){ const all = JSON.parse(JSON.stringify(log(T.date).sets || {})), x = all[T.edit.c][T.edit.i];
    if (ds.gest === 'w') x.w = stepPeso(eqDe(T.edit.c), x.u, x.w, +ds.d); else x.r = Math.max(1, x.r + +ds.d * (x.secs ? 5 : 1));
    setLog(T.date, { sets: all }); gRefresh(); return; }
  if (ds.gdel){ const [c, i] = ds.gdel.split(':'), all = JSON.parse(JSON.stringify(log(T.date).sets || {}));
    all[c].splice(+i, 1); if (!all[c].length) delete all[c];
    T.edit = null; setLog(T.date, { sets: all }); gRefresh(); return; }
  if (ds.grest){ const c = T.clock; if (c){ c.dur = Math.max(c.el + 1, c.dur + +ds.grest); document.getElementById('tmSub').textContent = 'de ' + mmss(Math.round(c.dur)); } return; }
  if ('gskip' in ds){ const c = T.clock; if (c){ T.clock = null; cancelAnimationFrame(T.raf); c.done(); } return; }
  if ('ghpause' in ds){ const c = T.clock; if (c){ c.running = !c.running; c.last = performance.now(); if (c.running && audio) audio.resume(); } return; }
  if ('ghstop' in ds){ const c = T.clock; if (!c) return; if (c.kind === 'hold') holdDone(Math.max(1, Math.round(c.el))); else { T.clock = null; c.done(); } return; }
  if ('ghcancel' in ds){ showSerie(T.code); return; }
  if (ds.gpain != null){ const v = +ds.gpain, d = T && T.gym ? T.date : state.date, nv = log(d).gymPain === v ? null : v; setLog(d, { gymPain: nv });
    const sc = document.getElementById('gpainScale');
    if (sc && T && T.mode === 'fin'){ sc.innerHTML = scale('gpain', nv); document.getElementById('gpainNote').textContent = gpainNote(nv); } else render(); return; }
  if (ds.bw){ const cur = log(state.date).bw, last = [...allLogs()].reverse().find(x => x.date < state.date && typeof x.L.bw === 'number');
    const v = cur == null ? (last ? last.L.bw : 60) : Math.max(30, Math.min(200, cur + +ds.bw));
    setLog(state.date, { bw: Math.round(v * 10) / 10 }); render(); return; }
  if ('tstart' in ds){ startTimer(); return; }
  if ('tpause' in ds){ T.running = !T.running; T.last = performance.now(); if (T.running && audio) audio.resume(); return; }
  if ('tskip' in ds){ jump(1); return; }
  if ('tback' in ds){ jump(-1); return; }
  if ('settings' in ds){ showSettings(); return; }
  if (ds.date){ state.date = ds.date; state.rehabOpen = false; render(); return; }
  if ('fold' in ds){ state.rehabOpen = !state.rehabOpen; render(); return; }
  if (ds.gcheck){ const g = Object.assign({}, log(state.date).gym); g[ds.gcheck] = !g[ds.gcheck]; setLog(state.date, { gym:g }); render(); return; }
  if (ds.check != null){ const L = log(state.date), c = L.checks || {}; c[ds.check] = !c[ds.check]; setLog(state.date, { checks:c }); render(); return; }
  if (ds.pain != null){ const v = +ds.pain; setLog(state.date, { pain: log(state.date).pain === v ? null : v }); render(); return; }
  if (ds.morning != null){ const v = +ds.morning; setLog(state.date, { morning: log(state.date).morning === v ? null : v }); render(); return; }
  if (ds.hours){ const h = Math.max(0, Math.min(18, (log(state.date).hours || 0) + +ds.hours)); setLog(state.date, { hours:h }); render(); return; }
  if (ds.phase != null){ const n = +ds.phase; state.openPhase = state.openPhase === n ? -1 : n; render(); return; }
  if (ds.setphase != null){ store.set('settings', Object.assign(settings(), { phase:+ds.setphase })); if (!$sheet.hidden) showSettings(); else { state.openPhase = +ds.setphase; } render(); return; }
  if (ds.etapa != null){ const n = +ds.etapa; state.openEtapa = state.openEtapa === n ? -1 : n; render(); return; }
  if (ds.setetapa != null){ store.set('settings', Object.assign(settings(), { etapa:+ds.setetapa })); if (!$sheet.hidden) showSettings(); else { state.openEtapa = +ds.setetapa; } render(); return; }
  if (ds.seg){ if (state.seg[ds.seg] === ds.v) return; state.seg = Object.assign({}, state.seg, { [ds.seg]: ds.v }); store.set('seg', state.seg); animateView(ds.v === 'gym' ? 1 : -1); render(); window.scrollTo(0,0); return; }
  if (ds.crit){ const c = store.get('crit', {}); c[ds.crit] = !c[ds.crit]; store.set('crit', c); render(); return; }
  if (ds.vmark){ markVideo(ds.vurl, ds.vmark); return; }
  if (ds.ficha){ showFicha(ds.ficha); return; }
  if (ds.section != null){ showSection(ds.section); return; }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q'){ state.q = e.target.value; $view.dataset.tab = 'guia'; renderGuia(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'restoreFile' && e.target.files[0]){ readRestore(e.target.files[0]); e.target.value = ''; return; }
  if (e.target.id === 'start' && e.target.value){ store.set('settings', Object.assign(settings(), { start:e.target.value })); render(); showSettings(); }
});

render();
requestAnimationFrame(() => requestAnimationFrame(() => $pill.classList.add('ready')));
})();
