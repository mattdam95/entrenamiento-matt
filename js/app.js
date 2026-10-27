(async function(){
/* ---------- almacenamiento ---------- */
const mem = {};
const store = {
  get(k, d){ try{ const v = localStorage.getItem('ab24:'+k); return v==null ? (k in mem ? mem[k] : d) : JSON.parse(v); }catch(e){ return k in mem ? mem[k] : d; } },
  set(k, v){ mem[k] = v; try{ localStorage.setItem('ab24:'+k, JSON.stringify(v)); }catch(e){} }
};

/* ---------- fechas ---------- */
const pad2 = n => String(n).padStart(2,'0');
const iso = d => d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const parseIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DCORTO = ['D','L','M','M','J','V','S'];
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const todayIso = iso(new Date());

/* ---------- plan (markdown) ---------- */
/* el contenido vive en content/plan.md (o embebido en <script id="plan">) */
const embedded = document.getElementById('plan');
/* videos de referencia por ficha (content/videos.json); si no cargan, la app sigue sin esa sección */
const videosReq = fetch('content/videos.json', { cache:'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
let text;
try{ text = embedded ? embedded.textContent : await fetch('content/plan.md', { cache:'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }); }
catch(e){ document.getElementById('view').innerHTML = '<p class="disclaimer">No se pudo cargar el plan. Revisá la conexión y volvé a abrir la página.</p>'; return; }
const raw = text.replace(/^---[\s\S]*?---\s*/, '');
const md = s => window.marked ? marked.parse(s) : '<pre style="white-space:pre-wrap">'+esc(s)+'</pre>';
function esc(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function inline(s){ return window.marked ? marked.parseInline(s) : esc(s); }

const parts = raw.split(/^## /m);
const introMd = parts[0].replace(/^Índice[\s\S]*$/m, '').trim();
const sections = parts.slice(1).map(p => {
  const nl = p.indexOf('\n');
  const title = p.slice(0, nl).trim();
  const m = title.match(/^(\d+)\s*·\s*(.*)$/);
  return { n: m ? +m[1] : 0, title: m ? m[2] : title, body: p.slice(nl+1).trim() };
});
const sec = n => sections.find(s => s.n === n);

/* fichas (sección 6) */
const fichaSec = sec(6);
const fichas = fichaSec.body.split(/^#### /m).slice(1).map(chunk => {
  const lines = chunk.split('\n');
  const m = lines[0].match(/^(\d+)\s*·\s*(.*)$/);
  let rest = lines.slice(1).join('\n').trim();
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
  return { n: +m[1], name: m[2].trim(), en: sub ? sub[1].trim() : '', tags: sub ? sub[2].split('·').map(t => t.trim()).filter(Boolean) : [], body: rest, dose };
});
const fichaIntro = fichaSec.body.split(/^#### /m)[0].trim();
const videos = ((await videosReq) || {}).videos || [];
const videosDe = n => videos.filter(v => v.ficha === n && v.url);

/* fases (sección 7) */
const faseSec = sec(7);
const faseChunks = faseSec.body.split(/^(\d)\s*$/m);
const faseIntro = faseChunks[0].trim();
const fases = [];
for (let i = 1; i < faseChunks.length; i += 2) {
  const n = +faseChunks[i]; const c = faseChunks[i+1].trim();
  const t = c.match(/^### (.*)$/m); const after = c.replace(/^### .*$/m, '').trim();
  const nl = after.indexOf('\n');
  fases.push({ n, title: t ? t[1].trim() : 'Fase '+n, sub: (nl < 0 ? after : after.slice(0, nl)).trim(), body: nl < 0 ? '' : after.slice(nl+1).trim() });
}

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

/* ---------- estado ---------- */
let state = {
  tab: ['hoy','programa','fichas','guia'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'hoy',
  date: todayIso,
  openPhase: null,
  q: ''
};
const settings = () => Object.assign({ phase: 1, start: todayIso, sound: true }, store.get('settings', {}));
const log = date => store.get('log:'+date, {});
const setLog = (date, patch) => store.set('log:'+date, Object.assign(log(date), patch));
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

function renderHoy(){
  const s = settings(), d = parseIso(state.date), dow = d.getDay();
  const ses = PLAN[s.phase](dow);
  const L = log(state.date), checks = L.checks || {};
  const total = ses.items.length, done = ses.items.filter((_, i) => checks[i]).length;
  const C = 2*Math.PI*26, frac = total ? done/total : 0;
  const monday = addDays(d, -((dow+6)%7));
  const days = [...Array(7)].map((_, i) => addDays(monday, i));
  const isToday = state.date === todayIso;

  const items = ses.items.map((it, i) => {
    const on = !!checks[i];
    const code = it.f ? `<span class="fnum">F${it.f}</span>` : `<span class="fnum x">+</span>`;
    const name = it.f ? F[it.f] : it.name;
    const text = `<div style="flex:1;min-width:0"><div class="name">${name}${it.f?'<span class="more" aria-hidden="true"> ›</span>':''}</div>${it.dose?`<div class="dose mono">${it.dose}</div>`:''}</div>`;
    return `<div class="ex ${on?'done':''}">${it.f ? `<button class="exinfo" data-ficha="${it.f}" aria-label="Ver ficha de ${name}">${code}${text}</button>` : code + text}${it.spec?`<button class="play" data-timer="${i}" aria-label="Timer de ${name}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg></button>`:''}<button class="checkbtn" data-check="${i}" aria-pressed="${on}" aria-label="Marcar hecho"><span class="check"></span></button></div>`;
  }).join('');

  const pain = L.pain, morning = L.morning, hours = L.hours ?? 0;
  const scale = (key, val) => [...Array(11)].map((_, v) => `<button class="z-${zone(v)}" data-${key}="${v}" aria-pressed="${val===v}" aria-label="${v} de 10">${v}</button>`).join('');
  const painNote = pain == null ? 'Tocá el dolor máximo que sentiste durante la sesión o la actividad.'
    : pain <= 3 ? 'Dentro de lo aceptable. Si mañana estás en tu línea de base, cuenta para subir.'
    : pain === 4 ? 'Mantené: no subas carga hasta que vuelva a ≤3/10.'
    : 'Por encima del límite. Bajá un escalón: peso o nivel anterior (§9).';

  /* últimos 14 días */
  const hist = [...Array(14)].map((_, i) => { const dd = iso(addDays(parseIso(todayIso), i-13)); return { dd, v: log(dd).pain }; });
  const bars = hist.map(h => `<div class="${h.v==null?'':zone(h.v)} ${h.dd===state.date?'sel':''}" style="height:${h.v==null?3:Math.max(6, h.v*10)}%" title="${h.dd}: ${h.v ?? '—'}"></div>`).join('');

  $view.innerHTML = `
    ${head(`${DIAS[dow]} ${d.getDate()} ${MESES[d.getMonth()]}`, isToday ? 'Hoy' : DIAS[dow],
      `<button class="chip glass" data-settings><span class="dot"></span>Fase ${s.phase} · sem ${weekOf(state.date)}</button>`)}
    <div class="week glass">${days.map(x => { const k = iso(x), has = log(k).pain != null || Object.values(log(k).checks||{}).some(Boolean);
      return `<button class="day ${k===todayIso?'today':''}" data-date="${k}" aria-pressed="${k===state.date}">${DCORTO[x.getDay()]}<b>${x.getDate()}</b><i class="${has?'has':''}"></i></button>`; }).join('')}</div>
    <section class="glass pad">
      <div class="row between" style="margin-bottom:${total?6:0}px">
        <div><div class="eyebrow">${ses.label}</div><div style="font-size:20px;font-weight:700;margin-top:3px">${ses.time || (total ? total+' ítems' : 'Sin ejercicios')}</div></div>
        ${total ? `<svg class="ring" viewBox="0 0 62 62"><circle cx="31" cy="31" r="26" stroke="var(--hair)"/><circle cx="31" cy="31" r="26" stroke="var(--ok)" stroke-dasharray="${C*frac} ${C}" transform="rotate(-90 31 31)"/><text x="31" y="36" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${done}/${total}</text></svg>` : ''}
      </div>
      <div>${items}</div>
      ${ses.info ? `<div class="info">${ses.info}</div>` : ''}
    </section>
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
    <p class="disclaimer">Orientativo: no reemplaza a tu traumatólogo o kinesiólogo. Los registros se guardan sólo en este dispositivo. ${backupAge()} <button data-settings style="color:var(--accent);font-size:inherit">Hacer backup</button></p>`;
}

function renderPrograma(){
  const s = settings();
  if (state.openPhase == null) state.openPhase = s.phase;
  const crit = store.get('crit', {});
  $view.innerHTML = `
    ${head('24 semanas · se avanza por criterios', 'Programa')}
    ${fases.map(f => {
      const cls = f.n < s.phase ? 'past' : f.n === s.phase ? 'now' : 'next';
      const open = state.openPhase === f.n;
      return `<section class="glass phase ${cls} ${open?'open':''}">
        <button class="phase-head" data-phase="${f.n}" aria-expanded="${open}" style="width:100%;text-align:left">
          <span class="pn">${f.n}</span>
          <div style="flex:1;min-width:0"><h3>${esc(f.title)}</h3><div class="wk">${inline(f.sub)}</div></div>
          <span class="chev">›</span></button>
        ${open ? `<div class="phase-body md">${phaseBody(f, crit)}</div>
          ${f.n !== s.phase ? `<div style="margin-top:12px"><button class="btn ghost" data-setphase="${f.n}">Estoy en esta fase</button></div>` : ''}` : ''}
      </section>`;
    }).join('')}
    <button class="glass pad row between" data-section="8" style="width:100%;text-align:left">
      <div><div class="eyebrow">§8</div><div style="font-size:16px;font-weight:600;margin-top:3px">Semana tipo</div></div><span class="chev">›</span></button>
    <button class="glass pad row between" data-section="9" style="width:100%;text-align:left">
      <div><div class="eyebrow">§9</div><div style="font-size:16px;font-weight:600;margin-top:3px">Cómo progresar y cuándo frenar</div></div><span class="chev">›</span></button>
    <p class="disclaimer">${inline(faseIntro)}</p>`;
}

function phaseBody(f, crit){
  const wrap = document.createElement('div');
  wrap.innerHTML = md(f.body);
  wrap.querySelectorAll('p > strong:only-child').forEach(st => {
    const t = st.textContent, ul = st.parentElement.nextElementSibling;
    if (/^Avanzás/.test(t)) {
      st.className = 'lbl-ok';
      if (ul && ul.tagName === 'UL') {
        ul.classList.add('crit');
        [...ul.children].forEach((li, i) => {
          const k = f.n+':'+i;
          li.dataset.crit = k;
          li.innerHTML = `<span class="check ${crit[k]?'done':''}"></span><span>${li.innerHTML}</span>`;
        });
      }
    } else if (/^Retroced/.test(t)) st.className = 'lbl-bad';
    else if (/^Consult/.test(t)) st.className = 'lbl-warn';
  });
  return wrap.innerHTML;
}

function renderFichas(){
  $view.innerHTML = `
    ${head('Doce ejercicios · dosis por brazo', 'Fichas')}
    <section class="glass list">${fichas.map(f => { const nv = videosDe(f.n).length;
      const sub = f.tags.concat(nv ? [`${nv} video${nv > 1 ? 's' : ''}`] : []).join(' · ');
      return `
      <button class="li" data-ficha="${f.n}"><span class="badge">F${f.n}</span>
        <div style="flex:1;min-width:0"><div class="t">${esc(f.name)}</div><div class="s">${esc(sub)}</div></div><span class="chev">›</span></button>`; }).join('')}
    </section>
    <section class="glass pad md">${md(fichaIntro)}</section>`;
}

function renderGuia(){
  const q = norm(state.q.trim());
  const all = [{ n:0, title:'Sobre este plan', body:introMd }].concat(sections);
  const hits = q ? all.filter(s => norm(s.title + ' ' + s.body).includes(q)) : all;
  const listHtml = hits.map(s => {
    let snip = '';
    if (q) { const plain = s.body.replace(/[*`#>|_\[\]]/g, ''); const i = norm(plain).indexOf(q);
      if (i >= 0) snip = esc(plain.slice(Math.max(0, i-40), i)) + '<mark>' + esc(plain.slice(i, i+q.length)) + '</mark>' + esc(plain.slice(i+q.length, i+q.length+60)); }
    return `<button class="li" data-section="${s.n}"><div style="flex:1;min-width:0"><div class="t">${esc(s.title)}</div>${snip?`<div class="s">…${snip}…</div>`:''}</div><small>${s.n?'§'+s.n:''}</small><span class="chev">›</span></button>`;
  }).join('') || '<div class="li muted">Sin resultados.</div>';

  if ($view.dataset.tab === 'guia' && document.getElementById('q')) { document.getElementById('glist').innerHTML = listHtml; return; }
  $view.innerHTML = `
    ${head('Reglas y retorno', 'Guía')}
    <label class="search glass"><span class="muted" aria-hidden="true">⌕</span><input id="q" type="search" placeholder="Buscar en el plan" value="${esc(state.q)}" autocomplete="off"></label>
    <section class="glass pad"><div class="eyebrow">Dolor aceptable, en una frase</div>
      <div class="big">Molestia difusa ≤3–4/10 que no te cambia la técnica, se va en pocas horas y mañana no está.</div></section>
    <section class="glass pad lights">
      <div class="lrow"><span class="lamp" style="background:var(--ok)"></span><div><b>Subís</b><p>Dos sesiones seguidas con técnica correcta y ≤3/10, y a la mañana en tu línea de base. Una sola variable: +0,25–0,5 kg, o +2–3 reps, o +10–20 % de minutos.</p></div></div>
      <div class="lrow"><span class="lamp" style="background:var(--warn)"></span><div><b>Mantenés</b><p>Dolor 3–4/10 durante que se va en horas, o un día malo aislado en una semana que viene bien.</p></div></div>
      <div class="lrow"><span class="lamp" style="background:var(--stop)"></span><div><b>Bajás un escalón</b><p>Dolor &gt;4/10 durante, por encima de tu base a la mañana y 24 h más, dos semanas de dolor en subida, o vuelve el hormigueo.</p></div></div>
    </section>
    <section class="glass list" id="glist">${listHtml}</section>`;
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
  $sheet.addEventListener('touchstart', e => { const t = e.touches[0]; if (t.clientX > 28 || (T && T.steps)) return; x0 = t.clientX; y0 = t.clientY; dx = 0; horiz = null; w = $sheet.offsetWidth; }, { passive:true });
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
function showFicha(n){
  const f = fichas.find(x => x.n === n);
  const tags = f.tags.map(t => `<span class="tag ${/PRINCIPAL/i.test(t)?'main':''}">${esc(t)}</span>`).join('');
  const body = f.body.replace(/^- \*\*Dosis\*\* — .*$/m, '');
  openSheet(state.tab === 'hoy' ? 'Hoy' : 'Fichas', `
    <section class="glass hero"><div class="tags"><span class="tag">Ficha ${f.n} de 12</span>${tags}</div>
      <h2>${esc(f.name)}</h2><div class="en">${esc(f.en)}</div></section>
    ${f.dose ? `<section class="glass dosecard md"><div class="eyebrow" style="margin-bottom:6px">Dosis</div>${inline(f.dose)}</section>` : ''}
    ${videosDe(n).length ? `<section class="videos" id="fvideos" data-n="${n}">${videoCards(n)}</section>` : ''}
    <div class="md cards">${md(body)}</div>
    <div class="row between">
      ${n > 1 ? `<button class="btn ghost" data-ficha="${n-1}">‹ F${n-1}</button>` : '<span></span>'}
      ${n < 12 ? `<button class="btn ghost" data-ficha="${n+1}">F${n+1} ›</button>` : ''}
    </div>`);
}
/* validación desde la app: store 'videos' = { [url]: "ok" | "no" }; los "no" van al final */
function videoCards(n){
  const marks = store.get('videos', {});
  const list = videosDe(n).map((v, i) => ({ v, i, m: marks[v.url] })).sort((a, b) => (a.m === 'no') - (b.m === 'no') || a.i - b.i);
  return `<div class="eyebrow" style="padding:0 4px">Videos</div>${list.map(({ v, m }) => `
    <div class="glass vcard ${m === 'ok' ? 'ok' : m === 'no' ? 'no' : ''}">
      <a class="vt" href="${esc(v.url)}" target="_blank" rel="noopener">${m === 'ok' ? '<span class="check done" aria-label="Sirve"></span>' : ''}<span>${esc(v.titulo || v.url)}</span></a>
      <div class="vmeta">${esc([v.canal, v.idioma === 'es' ? 'Español' : v.idioma === 'en' ? 'Inglés' : v.idioma].filter(Boolean).join(' · '))}</div>
      ${v.nota ? `<p class="vnote">${esc(v.nota)}</p>` : ''}
      <div class="row vbtns">
        <button class="vbtn" data-vurl="${esc(v.url)}" data-vmark="ok" aria-pressed="${m === 'ok'}">Sirve</button>
        <button class="vbtn" data-vurl="${esc(v.url)}" data-vmark="no" aria-pressed="${m === 'no'}">No sirve</button>
      </div>
    </div>`).join('')}`;
}
function markVideo(url, mark){
  const marks = store.get('videos', {});
  if (marks[url] === mark) delete marks[url]; else marks[url] = mark;
  store.set('videos', marks);
  const sec = document.getElementById('fvideos');
  if (sec) sec.innerHTML = videoCards(+sec.dataset.n);
}
function showSection(n){
  const s = n === 0 ? { n:0, title:'Sobre este plan', body:introMd } : sec(n);
  const back = state.tab === 'programa' ? 'Programa' : 'Guía';
  openSheet(back, `<div>${n?`<div class="eyebrow">§${n}</div>`:''}<h1 class="large" style="font-size:30px;text-wrap:balance">${esc(s.title)}</h1></div>
    <section class="glass pad md">${md(s.body)}</section>`);
}
function showSettings(){
  const s = settings();
  openSheet('Hoy', `
    <div><h1 class="large">Ajustes</h1></div>
    <section class="glass pad">
      <div class="eyebrow">Fase actual</div>
      <div class="seg" style="margin-top:10px">${[0,1,2,3,4].map(p => `<button data-setphase="${p}" aria-pressed="${s.phase===p}">${p}</button>`).join('')}</div>
      <div class="note">${esc(fases.find(f => f.n === s.phase)?.title || '')}. Se avanza por criterios, no por calendario: mirá la pestaña Programa.</div>
      <label class="field" style="margin-top:12px"><span>Inicio del plan</span><input id="start" type="date" value="${s.start}"></label>
      <div class="note">Se usa para calcular la semana (hoy: semana ${weekOf(todayIso)}).</div>
    </section>
    <section class="glass pad">
      <div class="eyebrow">Copia de seguridad</div>
      <div class="note">Guarda en un archivo .json tus registros de dolor, tildes, criterios, fase, fecha de inicio y la validación de los videos. Si perdés la web o cambiás de teléfono, lo restaurás desde acá.</div>
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
  return `${days.length} día${days.length === 1 ? '' : 's'} registrado${days.length === 1 ? '' : 's'}${days.length ? ` (${days[0].slice(4)} a ${days[days.length-1].slice(4)})` : ''} · fase ${s.phase ?? '—'}`;
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
  state.openPhase = null;
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

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-crit]'); if (!t) return;
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
  if ('sound' in ds){ store.set('settings', Object.assign(settings(), { sound: !settings().sound })); renderTimerSetup(); return; }
  if ('tstart' in ds){ startTimer(); return; }
  if ('tpause' in ds){ T.running = !T.running; T.last = performance.now(); if (T.running && audio) audio.resume(); return; }
  if ('tskip' in ds){ jump(1); return; }
  if ('tback' in ds){ jump(-1); return; }
  if ('settings' in ds){ showSettings(); return; }
  if (ds.date){ state.date = ds.date; render(); return; }
  if (ds.check != null){ const L = log(state.date), c = L.checks || {}; c[ds.check] = !c[ds.check]; setLog(state.date, { checks:c }); render(); return; }
  if (ds.pain != null){ const v = +ds.pain; setLog(state.date, { pain: log(state.date).pain === v ? null : v }); render(); return; }
  if (ds.morning != null){ const v = +ds.morning; setLog(state.date, { morning: log(state.date).morning === v ? null : v }); render(); return; }
  if (ds.hours){ const h = Math.max(0, Math.min(18, (log(state.date).hours || 0) + +ds.hours)); setLog(state.date, { hours:h }); render(); return; }
  if (ds.phase != null){ const n = +ds.phase; state.openPhase = state.openPhase === n ? -1 : n; render(); return; }
  if (ds.setphase != null){ store.set('settings', Object.assign(settings(), { phase:+ds.setphase })); if (!$sheet.hidden) showSettings(); else { state.openPhase = +ds.setphase; } render(); return; }
  if (ds.crit){ const c = store.get('crit', {}); c[ds.crit] = !c[ds.crit]; store.set('crit', c); render(); return; }
  if (ds.vmark){ markVideo(ds.vurl, ds.vmark); return; }
  if (ds.ficha){ showFicha(+ds.ficha); return; }
  if (ds.section != null){ showSection(+ds.section); return; }
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
