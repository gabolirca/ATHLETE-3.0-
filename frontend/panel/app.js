import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'athlete3' }, auth: { persistSession: true, detectSessionInUrl: true } });

// Mismos íconos y colores que la app (MaterialCommunityIcons = Material Design Icons).
const ICONS = [['dumbbell','Pesa'],['weight-lifter','Pierna'],['arm-flex','Brazo'],['rowing','Espalda'],['human-handsup','Hombro'],['human-handsdown','Core'],
  ['kettlebell','Kettlebell'],['weight','Fuerza'],['run','Correr'],['bike','Bici'],['swim','Nadar'],['heart-pulse','Cardio'],['jump-rope','Cuerda'],
  ['boxing-glove','Box'],['karate','Combate'],['yoga','Movilidad'],['stairs','Escaleras'],['fire','Quema'],['lightning-bolt','Potencia'],['trophy-outline','Reto'],
  ['calendar-check','Programa'],['calendar-month','Mes'],['flag-checkered','Meta'],['medal-outline','Medalla']];
const COLORS = { blue:'#1769FF', green:'#2BC48A', amber:'#F5B841', red:'#EF3340', cyan:'#3CC8E6', purple:'#9B7BFF' };
const LEVELS = ['principiante','intermedio','avanzado'];
const STATUS = { draft:'BORRADOR', published:'PUBLICADA', archived:'ARCHIVADA' };
const ERRORS = {
  'ATHLETE:VALIDATION_FAILED': 'Revisa los datos: algún ejercicio no existe o un valor está fuera de rango.',
  'ATHLETE:PROGRAM_HAS_UNPUBLISHED_ROUTINES': 'Primero publica todas las rutinas que usa este programa.',
  'ATHLETE:USER_NOT_FOUND': 'Esa persona aún no tiene cuenta: pídele que entre una vez al panel con su correo.',
  'ATHLETE:FORBIDDEN': 'No tienes permiso para esto.',
};

const $app = document.getElementById('app');
const state = { user: null, role: null, view: 'routines', routines: [], programs: [], exercises: [], exById: new Map() };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const badge = (icon, color, size = 48) => `<div class="badge" style="width:${size}px;height:${size}px;background:${COLORS[color]}26;color:${COLORS[color]};font-size:${size*0.55}px"><i class="mdi mdi-${esc(icon)}"></i></div>`;
function toast(msg, err = false) {
  const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3800);
}
function fail(error) {
  const msg = Object.entries(ERRORS).find(([k]) => error?.message?.includes(k))?.[1]
    ?? (error?.code === '42501' || /row-level security/.test(error?.message ?? '') ? 'No tienes permiso para esto (los coaches solo editan sus borradores).' : error?.message ?? 'Algo salió mal.');
  toast(msg, true);
}
const isAdmin = () => state.role === 'admin';
const canEdit = (item) => isAdmin() || (item.created_by === state.user.id && item.status === 'draft');

// ---------- Sesión ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((_e, s) => { if ((s?.user?.id ?? null) !== (state.user?.id ?? null)) location.reload(); });
  if (!session) return renderLogin();
  state.user = session.user;
  const { data: role } = await sb.rpc('library_role');
  state.role = role ?? null;
  document.getElementById('who').innerHTML = `<span>${esc(state.user.email)}${state.role ? ` · ${state.role === 'admin' ? 'Dueño' : 'Coach'}` : ''}</span><button class="btn" id="pwd">Contraseña</button><button class="btn" id="out">Salir</button>`;
  document.getElementById('out').onclick = () => sb.auth.signOut();
  document.getElementById('pwd').onclick = async () => {
    const p = prompt('Nueva contraseña (mínimo 8 caracteres):');
    if (!p) return;
    if (p.length < 8) return toast('Mínimo 8 caracteres.', true);
    const { error } = await sb.auth.updateUser({ password: p });
    error ? fail(error) : toast('Contraseña guardada.');
  };
  if (!state.role) {
    $app.innerHTML = `<div class="login card"><h1>Sin acceso</h1><p class="muted">Tu cuenta <b>${esc(state.user.email)}</b> todavía no está en el equipo. Pide al dueño de ATHLETE que te agregue en <b>Equipo</b> y vuelve a entrar.</p></div>`;
    return;
  }
  document.getElementById('nav').hidden = false;
  document.getElementById('teamTab').hidden = !isAdmin();
  document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => go(b.dataset.view); });
  await loadExercises();
  go(['routines', 'programs', 'team'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'routines');
}

function renderLogin() {
  $app.innerHTML = `<form class="login card" id="lf">
    <h1>Panel ATHLETE</h1><p class="muted">Rutinas y programas para la app. Entra con tu correo.</p>
    <div><label>Correo</label><input type="email" id="em" required autocomplete="email"></div>
    <div><label>Contraseña</label><input type="password" id="pw" autocomplete="current-password"></div>
    <button class="btn primary" type="submit">Entrar</button>
    <button class="btn" type="button" id="ml">Mandarme un enlace de acceso al correo</button>
    <p class="muted" style="font-size:12px">¿Primera vez o sin contraseña? Usa el enlace; ya dentro pon tu contraseña con el botón “Contraseña”.</p>
  </form>`;
  const em = document.getElementById('em'), pw = document.getElementById('pw');
  document.getElementById('lf').onsubmit = async (e) => {
    e.preventDefault();
    if (!pw.value) return toast('Escribe tu contraseña o usa el enlace.', true);
    const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
    if (error) toast('Correo o contraseña incorrectos.', true);
  };
  document.getElementById('ml').onclick = async () => {
    if (!em.value.trim()) return toast('Escribe tu correo primero.', true);
    const { error } = await sb.auth.signInWithOtp({ email: em.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
    error ? fail(error) : toast('Listo: revisa tu correo y abre el enlace.');
  };
}

// ---------- Datos ----------
async function loadExercises() {
  const [{ data: ex, error }, { data: mg }] = await Promise.all([
    sb.from('exercises').select('id,name,primary_muscle_group_ids,modality').is('user_id', null).is('deleted_at', null).is('archived_at', null).order('name'),
    sb.from('muscle_groups').select('id,name'),
  ]);
  if (error) return fail(error);
  const muscles = new Map((mg ?? []).map((m) => [m.id, m.name]));
  state.exercises = (ex ?? []).map((e) => ({ ...e, muscle: (e.primary_muscle_group_ids ?? []).map((id) => muscles.get(id)).filter(Boolean).join(', ') || (e.modality === 'cardio' ? 'Cardio' : '') }));
  state.exById = new Map(state.exercises.map((e) => [e.id, e]));
}
async function loadRoutines() {
  const { data, error } = await sb.from('library_routines').select('*').order('updated_at', { ascending: false });
  if (error) fail(error); state.routines = data ?? [];
}
async function loadPrograms() {
  const { data, error } = await sb.from('library_programs').select('*').order('updated_at', { ascending: false });
  if (error) fail(error); state.programs = data ?? [];
}

async function go(view) {
  state.view = view; history.replaceState(null, '', '#' + view);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'programs') { await Promise.all([loadRoutines(), loadPrograms()]); return renderList('programs'); }
  if (view === 'team' && isAdmin()) return renderTeam();
  await loadRoutines(); renderList('routines');
}

// ---------- Listas ----------
function renderList(kind) {
  const isR = kind === 'routines';
  const items = isR ? state.routines : state.programs;
  const filter = renderList.filter ?? 'activas';
  const shown = items.filter((i) => filter === 'todas' || (filter === 'archivadas' ? i.status === 'archived' : i.status !== 'archived'));
  $app.innerHTML = `<div class="row spread"><div><h1>${isR ? 'Rutinas' : 'Programas por semanas'}</h1>
      <p class="muted">${isR ? 'Sesiones sueltas con sus ejercicios. Se ven en la app como “Rutinas ATHLETE”.' : 'Calendario de semanas × días que usa tus rutinas publicadas.'}</p></div>
    <div class="row"><select id="flt" style="width:auto">${['activas','archivadas','todas'].map((f) => `<option ${f === filter ? 'selected' : ''}>${f}</option>`).join('')}</select>
    <button class="btn primary" id="new"><i class="mdi mdi-plus"></i> ${isR ? 'Nueva rutina' : 'Nuevo programa'}</button></div></div>
    ${shown.length ? `<div class="grid">${shown.map((i) => `<div class="card item" data-id="${i.id}">${badge(i.icon, i.color)}
      <div style="min-width:0"><h3>${esc(i.name)}</h3><div class="muted" style="font-size:13px">${isR ? `${i.exercises.length} ejercicios${i.minutes ? ` · ${i.minutes} min` : ''}` : `${i.weeks} semanas · ${i.days_per_week} días/sem`} · ${esc(i.level)}</div>
      <div style="margin-top:8px"><span class="chip ${i.status}">${STATUS[i.status]}</span></div></div></div>`).join('')}</div>`
    : `<div class="empty card" style="margin-top:18px"><i class="mdi mdi-${isR ? 'dumbbell' : 'calendar-month'}"></i>${isR ? 'Aún no hay rutinas. Crea la primera.' : 'Aún no hay programas. Primero crea y publica algunas rutinas.'}</div>`}`;
  document.getElementById('flt').onchange = (e) => { renderList.filter = e.target.value; renderList(kind); };
  document.getElementById('new').onclick = () => (isR ? editRoutine(null) : editProgram(null));
  $app.querySelectorAll('.item').forEach((el) => { el.onclick = () => { const it = items.find((i) => i.id === el.dataset.id); isR ? editRoutine(it) : editProgram(it); }; });
}

// ---------- Piezas del formulario ----------
function styleFields(d) {
  return `<div class="full"><label>Ícono</label><div class="icons">${ICONS.map(([k, l]) => `<button type="button" title="${l}" data-icon="${k}" class="${d.icon === k ? 'on' : ''}" style="${d.icon === k ? `background:${COLORS[d.color]}33;border-color:${COLORS[d.color]};color:${COLORS[d.color]}` : ''}"><i class="mdi mdi-${k}"></i></button>`).join('')}</div></div>
    <div class="full"><label>Color</label><div class="colors">${Object.entries(COLORS).map(([k, v]) => `<button type="button" data-color="${k}" class="${d.color === k ? 'on' : ''}" style="background:${v}"></button>`).join('')}</div></div>`;
}
function bindStyle(d, rerender) {
  $app.querySelectorAll('[data-icon]').forEach((b) => { b.onclick = () => { d.icon = b.dataset.icon; rerender(); }; });
  $app.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { d.color = b.dataset.color; rerender(); }; });
}
function baseFields(d, ro) {
  return `<div class="half"><label>Nombre</label><input id="f-name" maxlength="80" value="${esc(d.name)}" ${ro}></div>
    <div><label>Nivel</label><select id="f-level" ${ro}>${LEVELS.map((l) => `<option ${d.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Objetivo</label><input id="f-goal" maxlength="60" placeholder="Fuerza, híbrido, Hyrox…" value="${esc(d.goal)}" ${ro}></div>
    <div class="full"><label>Descripción</label><textarea id="f-desc" maxlength="1000" ${ro}>${esc(d.description)}</textarea></div>`;
}
function readBase(d) {
  for (const [k, id] of [['name','f-name'],['level','f-level'],['goal','f-goal'],['description','f-desc']]) { const el = document.getElementById(id); if (el) d[k] = el.value; }
}
function actions(item, d) {
  const ro = item && !canEdit(item);
  return `<div class="row" style="margin-top:20px">
    <button class="btn" id="back"><i class="mdi mdi-arrow-left"></i> Volver</button>
    ${ro ? `<span class="muted">${item.status === 'published' ? 'Publicada: solo el dueño la puede cambiar.' : 'Solo lectura.'}</span>` : `
    <button class="btn primary" id="save">${d.status === 'published' ? 'Guardar cambios' : 'Guardar borrador'}</button>
    ${isAdmin() && d.status !== 'published' ? '<button class="btn ok" id="pub">Publicar en la app</button>' : ''}
    ${isAdmin() && d.status === 'published' ? '<button class="btn" id="unpub">Volver a borrador</button>' : ''}
    ${isAdmin() && item && d.status !== 'archived' ? '<button class="btn danger" id="arch">Archivar</button>' : ''}`}
  </div>`;
}
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

// ---------- Editor de rutina ----------
function editRoutine(item) {
  const d = item ? structuredClone(item) : { name: '', description: '', icon: 'dumbbell', color: 'blue', level: 'intermedio', goal: '', minutes: null, exercises: [], status: 'draft' };
  const ro = item && !canEdit(item) ? 'disabled' : '';
  let query = '';
  const readForm = () => { readBase(d); const m = document.getElementById('f-min'); if (m) d.minutes = m.value === '' ? null : Number(m.value); };
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= d.exercises.length) return; [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]]; render(); };
  const drawPicker = () => {
    const box = document.getElementById('pick'); if (!box) return;
    const n = fold(query.trim());
    const list = state.exercises.filter((e) => !n || fold(`${e.name} ${e.muscle}`).includes(n)).slice(0, 80);
    box.innerHTML = list.map((e) => `<button data-add="${e.id}">${esc(e.name)}<small>${esc(e.muscle)}</small></button>`).join('') || '<p class="muted">Sin resultados.</p>';
    box.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { readForm(); d.exercises.push({ exercise_id: b.dataset.add, sets: 3, reps: 10, rest_seconds: 90, notes: '' }); render(); }; });
  };
  const exRow = (x, i) => `<div class="ex">
    <span class="n">${i + 1}</span><div><b>${esc(state.exById.get(x.exercise_id)?.name ?? 'Ejercicio no disponible')}</b><div class="muted" style="font-size:12px">${esc(state.exById.get(x.exercise_id)?.muscle)}</div></div>
    <div><label>Series</label><input type="number" min="1" max="20" data-i="${i}" data-k="sets" value="${x.sets ?? ''}" ${ro}></div>
    <div><label>Reps</label><input type="number" min="1" max="200" data-i="${i}" data-k="reps" value="${x.reps ?? ''}" ${ro}></div>
    <div><label>Descanso (s)</label><input type="number" min="0" max="900" data-i="${i}" data-k="rest_seconds" value="${x.rest_seconds ?? ''}" ${ro}></div>
    <div class="row" style="gap:0">${ro ? '' : `<button class="icon-btn" data-up="${i}" title="Subir"><i class="mdi mdi-chevron-up"></i></button><button class="icon-btn" data-down="${i}" title="Bajar"><i class="mdi mdi-chevron-down"></i></button><button class="icon-btn" data-del="${i}" title="Quitar"><i class="mdi mdi-close"></i></button>`}</div>
    <input class="notes" placeholder="Nota para el atleta (técnica, tempo, RIR…)" maxlength="300" data-i="${i}" data-k="notes" value="${esc(x.notes)}" ${ro}>
  </div>`;
  const render = () => {
    $app.innerHTML = `<div class="row">${badge(d.icon, d.color, 56)}<div><h1>${item ? esc(item.name) : 'Nueva rutina'}</h1><span class="chip ${d.status}">${STATUS[d.status]}</span></div></div>
    <div class="card" style="margin-top:18px"><div class="form">${baseFields(d, ro)}
      <div><label>Minutos aprox.</label><input id="f-min" type="number" min="5" max="240" value="${d.minutes ?? ''}" ${ro}></div>
      ${ro ? '' : styleFields(d)}</div></div>
    <div class="split">
      <div class="card"><h2 style="margin-top:0">EJERCICIOS (${d.exercises.length})</h2>
        ${d.exercises.length ? d.exercises.map(exRow).join('') : '<p class="muted">Agrega ejercicios desde el catálogo →</p>'}</div>
      ${ro ? '<div></div>' : `<div class="card"><h2 style="margin-top:0">CATÁLOGO (${state.exercises.length})</h2><input id="q" placeholder="Buscar ejercicio o músculo…" value="${esc(query)}"><div class="picker" id="pick"></div></div>`}
    </div>${actions(item, d)}`;
    drawPicker();
    bindStyle(d, () => { readForm(); render(); });
    $app.querySelectorAll('[data-k]').forEach((el) => { el.oninput = () => { const x = d.exercises[+el.dataset.i]; const k = el.dataset.k; x[k] = k === 'notes' ? el.value : (el.value === '' ? null : Number(el.value)); }; });
    $app.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { readForm(); move(+b.dataset.up, -1); }; });
    $app.querySelectorAll('[data-down]').forEach((b) => { b.onclick = () => { readForm(); move(+b.dataset.down, 1); }; });
    $app.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { readForm(); d.exercises.splice(+b.dataset.del, 1); render(); }; });
    const q = document.getElementById('q'); if (q) q.oninput = () => { query = q.value; drawPicker(); };
    bindActions(item, d, 'library_routines', readForm, () => go('routines'));
  };
  render();
}

// ---------- Editor de programa ----------
function editProgram(item) {
  const d = item ? structuredClone(item) : { name: '', description: '', icon: 'calendar-check', color: 'blue', level: 'intermedio', goal: '', weeks: 4, days_per_week: 4, schedule: [], status: 'draft' };
  const ro = item && !canEdit(item) ? 'disabled' : '';
  const usable = state.routines.filter((r) => r.status !== 'archived');
  const cellOf = (w, day) => d.schedule.find((c) => c.week === w && c.day === day);
  const readForm = () => {
    readBase(d);
    const w = document.getElementById('f-weeks'), dd = document.getElementById('f-days');
    if (w) d.weeks = Math.min(52, Math.max(1, Number(w.value) || 1));
    if (dd) d.days_per_week = Math.min(7, Math.max(1, Number(dd.value) || 1));
  };
  const cellHtml = (w, day) => { const c = cellOf(w, day) ?? {}; return `<td><div class="cell ${c.routine_id ? '' : 'rest'}">
    <select data-w="${w}" data-d="${day}" data-k="routine_id" ${ro}><option value="">— Descanso / libre —</option>${usable.map((r) => `<option value="${r.id}" ${c.routine_id === r.id ? 'selected' : ''}>${esc(r.name)}${r.status === 'published' ? '' : ' (borrador)'}</option>`).join('')}</select>
    <input placeholder="Título (opcional)" maxlength="80" data-w="${w}" data-d="${day}" data-k="title" value="${esc(c.title)}" ${ro}>
    <input placeholder="Nota (opcional)" maxlength="500" data-w="${w}" data-d="${day}" data-k="notes" value="${esc(c.notes)}" ${ro}>
  </div></td>`; };
  const render = () => {
    const weeks = Array.from({ length: d.weeks }, (_, i) => i + 1), days = Array.from({ length: d.days_per_week }, (_, i) => i + 1);
    $app.innerHTML = `<div class="row">${badge(d.icon, d.color, 56)}<div><h1>${item ? esc(item.name) : 'Nuevo programa'}</h1><span class="chip ${d.status}">${STATUS[d.status]}</span></div></div>
    <div class="card" style="margin-top:18px"><div class="form">${baseFields(d, ro)}
      <div><label>Semanas</label><input id="f-weeks" type="number" min="1" max="52" value="${d.weeks}" ${ro}></div>
      <div><label>Días por semana</label><input id="f-days" type="number" min="1" max="7" value="${d.days_per_week}" ${ro}></div>
      ${ro ? '' : styleFields(d)}</div></div>
    <div class="card" style="margin-top:18px"><div class="row spread"><h2 style="margin:0">CALENDARIO</h2>
      ${ro ? '' : '<button class="btn" id="copy1">Copiar semana 1 a todas</button>'}</div>
      ${usable.length ? '' : '<p class="muted">Aún no hay rutinas: créalas en la pestaña Rutinas.</p>'}
      <div class="sched"><table><thead><tr><th></th>${days.map((x) => `<th>DÍA ${x}</th>`).join('')}</tr></thead><tbody>
      ${weeks.map((w) => `<tr><th>SEM ${w}</th>${days.map((day) => cellHtml(w, day)).join('')}</tr>`).join('')}
      </tbody></table></div></div>${actions(item, d)}`;
    bindStyle(d, () => { readForm(); render(); });
    $app.querySelectorAll('[data-w]').forEach((el) => {
      el.onchange = el.oninput = () => {
        const w = +el.dataset.w, day = +el.dataset.d; let c = cellOf(w, day);
        if (!c) { c = { week: w, day }; d.schedule.push(c); }
        c[el.dataset.k] = el.value || null;
        if (el.dataset.k === 'routine_id') el.closest('.cell').classList.toggle('rest', !el.value);
      };
    });
    for (const id of ['f-weeks', 'f-days']) { const el = document.getElementById(id); if (el) el.onchange = () => { readForm(); render(); }; }
    const c1 = document.getElementById('copy1');
    if (c1) c1.onclick = () => {
      readForm(); const first = d.schedule.filter((c) => c.week === 1);
      d.schedule = [...first, ...Array.from({ length: d.weeks - 1 }, (_, i) => first.map((c) => ({ ...c, week: i + 2 }))).flat()];
      render(); toast('Semana 1 copiada; ahora ajusta la progresión de cada semana.');
    };
    bindActions(item, d, 'library_programs', readForm, () => go('programs'));
  };
  render();
}

// ---------- Guardar / publicar / archivar ----------
function payload(d, table) {
  const clean = (s) => (s ?? '').trim() || null;
  const base = { name: (d.name ?? '').trim(), description: clean(d.description), icon: d.icon, color: d.color, level: d.level, goal: clean(d.goal), status: d.status };
  if (table === 'library_routines') return { ...base, minutes: d.minutes || null,
    exercises: d.exercises.map((x) => ({ exercise_id: x.exercise_id, sets: x.sets || null, reps: x.reps || null, rest_seconds: x.rest_seconds ?? null, notes: clean(x.notes) })) };
  return { ...base, weeks: d.weeks, days_per_week: d.days_per_week,
    schedule: d.schedule.filter((c) => c.week <= d.weeks && c.day <= d.days_per_week && (c.routine_id || clean(c.title) || clean(c.notes)))
      .map((c) => ({ week: c.week, day: c.day, routine_id: c.routine_id || null, title: clean(c.title), notes: clean(c.notes) })) };
}
function bindActions(item, d, table, readForm, done) {
  document.getElementById('back').onclick = done;
  const save = async (status) => {
    readForm();
    if (!(d.name ?? '').trim()) return toast('Ponle nombre.', true);
    if (table === 'library_routines' && !d.exercises.length) return toast('Agrega al menos un ejercicio.', true);
    const body = payload({ ...d, status: status ?? d.status }, table);
    const { error } = item ? await sb.from(table).update(body).eq('id', item.id) : await sb.from(table).insert(body);
    if (error) return fail(error);
    toast(status === 'published' ? '¡Publicado!' : status === 'archived' ? 'Archivado.' : 'Guardado.');
    done();
  };
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('save', () => save());
  on('pub', () => save('published'));
  on('unpub', () => save('draft'));
  on('arch', () => { if (confirm('¿Archivar? Deja de verse en la app (no se borra).')) save('archived'); });
}

// ---------- Equipo ----------
async function renderTeam() {
  const { data, error } = await sb.rpc('library_team');
  if (error) return fail(error);
  $app.innerHTML = `<h1>Equipo</h1><p class="muted">Los coaches crean borradores; tú revisas y publicas. Para agregar a alguien, primero debe entrar una vez al panel con su correo.</p>
    <div class="card" style="margin-top:18px">${(data ?? []).map((m) => `<div class="row spread" style="padding:10px 0;border-top:1px solid var(--border)">
      <div><b>${esc(m.email)}</b> <span class="chip">${m.role === 'admin' ? 'DUEÑO' : 'COACH'}</span></div>
      ${m.role === 'editor' ? `<button class="btn danger" data-rm="${esc(m.email)}">Quitar</button>` : ''}</div>`).join('')}
      <form class="row" id="addf" style="margin-top:16px"><input type="email" id="addem" placeholder="correo@del-coach.com" required style="flex:1;min-width:220px"><button class="btn primary">Agregar coach</button></form></div>`;
  document.getElementById('addf').onsubmit = async (e) => {
    e.preventDefault();
    const { error: err } = await sb.rpc('library_set_editor', { p_email: document.getElementById('addem').value, p_enabled: true });
    err ? fail(err) : (toast('Coach agregado.'), renderTeam());
  };
  $app.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => {
    if (!confirm(`¿Quitar a ${b.dataset.rm} del equipo?`)) return;
    const { error: err } = await sb.rpc('library_set_editor', { p_email: b.dataset.rm, p_enabled: false });
    err ? fail(err) : (toast('Listo.'), renderTeam());
  }; });
}

boot().catch(fail);
