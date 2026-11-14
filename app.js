/* ===== NotaPro · Lógica de la aplicación ===== */
'use strict';

/* ---------- Constantes y estado ---------- */
const STORAGE_KEY = 'notapro.v1';
const THEME_KEY = 'notapro.theme';
const PASS_SCORE = 3.0;
const DEFAULT_SUBJECTS = ['Matemáticas', 'Español', 'Ciencias Naturales', 'Ciencias Sociales', 'Inglés', 'Informática', 'Educación Física'];
const VIEWS = {
  dashboard:   ['Panel', 'Resumen general del rendimiento académico'],
  estudiantes: ['Estudiantes', 'Registra y administra a tus estudiantes'],
  notas:       ['Notas', 'Registra calificaciones por materia y actividad'],
  tareas:      ['Tareas', 'Organiza entregas, fechas y prioridades'],
  boletin:     ['Boletín', 'Consulta e imprime el informe de cada estudiante']
};

let state = { students: [], grades: [], tasks: [] };

/* ---------- Utilidades ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (n) => Number(n).toFixed(1);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const byName = (a, b) => a.name.localeCompare(b.name, 'es');

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const a = new Date(y, m - 1, d);
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 864e5);
}
function level(avg) {
  if (avg === null) return { label: 'Sin notas', cls: 'b-none' };
  if (avg >= 4.5) return { label: 'Superior', cls: 'b-super' };
  if (avg >= 4.0) return { label: 'Alto', cls: 'b-alto' };
  if (avg >= PASS_SCORE) return { label: 'Básico', cls: 'b-basico' };
  return { label: 'Bajo', cls: 'b-bajo' };
}
function scoreBadge(score) {
  const l = level(score);
  return `<span class="badge ${l.cls} score">${fmt(score)}</span>`;
}
function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function avatar(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avatar" style="background:hsl(${h} 60% 48%)">${esc(initials(name))}</span>`;
}

/* ---------- Almacenamiento ---------- */
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar en el navegador.', true); }
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && Array.isArray(raw.students) && Array.isArray(raw.grades) && Array.isArray(raw.tasks)) state = raw;
  } catch (e) { /* datos corruptos: se inicia vacío */ }
}

/* ---------- Mensajes y confirmación ---------- */
function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function confirmBox(title, text, okLabel = 'Eliminar') {
  return new Promise((resolve) => {
    const dlg = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okLabel;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

/* ---------- Tema claro / oscuro ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeLabel').textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignorar */ }
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ---------- Navegación ---------- */
function showView(name) {
  if (!VIEWS[name]) name = 'dashboard';
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
  $$('.nav-btn').forEach((b) => { if (b.dataset.view === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#viewTitle').textContent = VIEWS[name][0];
  $('#viewSubtitle').textContent = VIEWS[name][1];
  document.title = `NotaPro · ${VIEWS[name][0]}`;
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0 });
}

/* ---------- Validación ---------- */
function setError(el, msg) {
  const box = el.closest('.field').querySelector('.error');
  box.textContent = msg || '';
  el.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
function validate(form, rules) {
  let ok = true, first = null;
  for (const [name, rule] of Object.entries(rules)) {
    const el = form.elements[name];
    const msg = rule(el.value.trim());
    setError(el, msg);
    if (msg && ok) { ok = false; first = el; }
  }
  if (first) first.focus();
  return ok;
}
function clearErrors(form) {
  $$('.field', form).forEach((f) => {
    f.querySelector('.error').textContent = '';
    const c = f.querySelector('input,select,textarea');
    if (c) c.removeAttribute('aria-invalid');
  });
}
function liveClear(form) {
  form.addEventListener('input', (e) => { if (e.target.closest('.field')) setError(e.target, ''); });
}

/* =====================================================
   ESTUDIANTES
   ===================================================== */
const studentForm = $('#studentForm');

function studentRules() {
  const editingId = studentForm.elements.id.value;
  return {
    name: (v) => !v ? 'Escribe el nombre completo.' : v.length < 3 ? 'Mínimo 3 caracteres.' : !/^[\p{L}\s.'-]+$/u.test(v) ? 'Solo letras y espacios.' : '',
    doc: (v) => {
      if (!v) return 'Escribe el número de documento.';
      if (!/^\d{5,12}$/.test(v)) return 'Debe tener entre 5 y 12 dígitos.';
      if (state.students.some((s) => s.doc === v && s.id !== editingId)) return 'Ya existe un estudiante con este documento.';
      return '';
    },
    grade: (v) => (v ? '' : 'Selecciona el curso.'),
    email: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'El correo no es válido.' : '')
  };
}

studentForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate(studentForm, studentRules())) return;
  const f = studentForm.elements;
  const data = { name: f.name.value.trim().replace(/\s+/g, ' '), doc: f.doc.value.trim(), grade: f.grade.value, email: f.email.value.trim() };
  if (f.id.value) {
    Object.assign(state.students.find((s) => s.id === f.id.value), data);
    toast('Estudiante actualizado.');
  } else {
    state.students.push({ id: uid(), ...data });
    toast('Estudiante registrado.');
  }
  save(); resetStudentForm(); renderAll();
});

function resetStudentForm() {
  studentForm.reset(); studentForm.elements.id.value = ''; clearErrors(studentForm);
  $('#studentFormTitle').textContent = 'Nuevo estudiante';
  $('#studentSubmit span').textContent = 'Registrar';
  $('#studentCancel').hidden = true;
}
$('#studentCancel').addEventListener('click', resetStudentForm);
liveClear(studentForm);

function renderStudents() {
  const q = norm($('#studentSearch').value);
  const list = state.students.filter((s) => norm(`${s.name} ${s.doc} ${s.grade}`).includes(q)).sort(byName);
  $('#studentsBody').innerHTML = list.length ? list.map((s) => {
    const avg = studentAvg(s.id);
    const lv = level(avg);
    return `<tr>
      <td data-label="Estudiante"><div class="person">${avatar(s.name)}<div style="text-align:left"><strong>${esc(s.name)}</strong><small>${esc(s.email || 'Sin correo')}</small></div></div></td>
      <td data-label="Documento">${esc(s.doc)}</td>
      <td data-label="Curso">${esc(s.grade)}</td>
      <td data-label="Promedio"><span class="badge ${lv.cls}">${avg === null ? '–' : fmt(avg)} · ${lv.label}</span></td>
      <td class="right"><div class="row-actions">
        <button class="mini" data-action="edit-student" data-id="${s.id}" aria-label="Editar ${esc(s.name)}"><svg class="ic"><use href="#i-edit"/></svg></button>
        <button class="mini del" data-action="del-student" data-id="${s.id}" aria-label="Eliminar ${esc(s.name)}"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div></td></tr>`;
  }).join('') : `<tr><td class="empty" colspan="5">${state.students.length ? 'Sin resultados para tu búsqueda.' : 'Aún no hay estudiantes. Registra el primero.'}</td></tr>`;
}

$('#studentsBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const s = state.students.find((x) => x.id === btn.dataset.id);
  if (!s) return;
  if (btn.dataset.action === 'edit-student') {
    const f = studentForm.elements;
    f.id.value = s.id; f.name.value = s.name; f.doc.value = s.doc; f.grade.value = s.grade; f.email.value = s.email;
    clearErrors(studentForm);
    $('#studentFormTitle').textContent = 'Editar estudiante';
    $('#studentSubmit span').textContent = 'Guardar cambios';
    $('#studentCancel').hidden = false;
    f.name.focus();
  } else {
    const n = state.grades.filter((g) => g.studentId === s.id).length;
    if (await confirmBox('Eliminar estudiante', `Se eliminará a ${s.name}${n ? ` y sus ${n} nota(s)` : ''}. Esta acción no se puede deshacer.`)) {
      state.students = state.students.filter((x) => x.id !== s.id);
      state.grades = state.grades.filter((g) => g.studentId !== s.id);
      save(); renderAll(); toast('Estudiante eliminado.');
    }
  }
});
$('#studentSearch').addEventListener('input', renderStudents);

/* =====================================================
   NOTAS
   ===================================================== */
const gradeForm = $('#gradeForm');

function studentAvg(id) { return mean(state.grades.filter((g) => g.studentId === id).map((g) => g.score)); }
const studentName = (id) => state.students.find((s) => s.id === id)?.name ?? 'Estudiante eliminado';

const gradeRules = {
  studentId: (v) => (v ? '' : 'Selecciona un estudiante.'),
  subject: (v) => !v ? 'Escribe la materia.' : v.length < 2 ? 'Mínimo 2 caracteres.' : '',
  type: (v) => (v ? '' : 'Selecciona el tipo de actividad.'),
  score: (v) => {
    if (v === '') return 'Escribe la nota.';
    const n = Number(v.replace(',', '.'));
    if (Number.isNaN(n)) return 'La nota debe ser un número.';
    return n < 0 || n > 5 ? 'La nota debe estar entre 0.0 y 5.0.' : '';
  },
  date: (v) => !v ? 'Selecciona la fecha.' : v > todayISO() ? 'La fecha no puede ser futura.' : ''
};

gradeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.students.length) { toast('Primero registra un estudiante.', true); return; }
  if (!validate(gradeForm, gradeRules)) return;
  const f = gradeForm.elements;
  const data = {
    studentId: f.studentId.value, subject: f.subject.value.trim(), type: f.type.value,
    score: Math.round(Number(f.score.value.replace(',', '.')) * 10) / 10, date: f.date.value, note: f.note.value.trim()
  };
  if (f.id.value) {
    Object.assign(state.grades.find((g) => g.id === f.id.value), data);
    toast('Nota actualizada.');
  } else {
    state.grades.push({ id: uid(), ...data });
    toast('Nota registrada.');
  }
  save(); resetGradeForm(); renderAll();
});

function resetGradeForm() {
  const keepStudent = gradeForm.elements.studentId.value;
  gradeForm.reset(); gradeForm.elements.id.value = ''; clearErrors(gradeForm);
  gradeForm.elements.date.value = todayISO();
  gradeForm.elements.studentId.value = keepStudent;
  $('#gradeFormTitle').textContent = 'Registrar nota';
  $('#gradeSubmit span').textContent = 'Guardar nota';
  $('#gradeCancel').hidden = true;
}
$('#gradeCancel').addEventListener('click', resetGradeForm);
liveClear(gradeForm);

function renderGrades() {
  const sid = $('#gradeFilterStudent').value;
  const q = norm($('#gradeSearch').value);
  const list = state.grades
    .filter((g) => (!sid || g.studentId === sid) && norm(`${g.subject} ${g.type}`).includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#gradesBody').innerHTML = list.length ? list.map((g) => `<tr>
      <td data-label="Fecha">${fmtDate(g.date)}</td>
      <td data-label="Estudiante">${esc(studentName(g.studentId))}</td>
      <td data-label="Materia">${esc(g.subject)}</td>
      <td data-label="Actividad">${esc(g.type)}</td>
      <td data-label="Nota">${scoreBadge(g.score)}</td>
      <td class="right"><div class="row-actions">
        <button class="mini" data-action="edit-grade" data-id="${g.id}" aria-label="Editar nota"><svg class="ic"><use href="#i-edit"/></svg></button>
        <button class="mini del" data-action="del-grade" data-id="${g.id}" aria-label="Eliminar nota"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div></td></tr>`).join('')
    : `<tr><td class="empty" colspan="6">${state.grades.length ? 'Sin resultados.' : 'Aún no hay notas registradas.'}</td></tr>`;
}

$('#gradesBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const g = state.grades.find((x) => x.id === btn.dataset.id);
  if (!g) return;
  if (btn.dataset.action === 'edit-grade') {
    const f = gradeForm.elements;
    f.id.value = g.id; f.studentId.value = g.studentId; f.subject.value = g.subject; f.type.value = g.type;
    f.score.value = g.score; f.date.value = g.date; f.note.value = g.note || '';
    clearErrors(gradeForm);
    $('#gradeFormTitle').textContent = 'Editar nota';
    $('#gradeSubmit span').textContent = 'Guardar cambios';
    $('#gradeCancel').hidden = false;
    f.score.focus();
    gradeForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (await confirmBox('Eliminar nota', `¿Eliminar la nota ${fmt(g.score)} de ${studentName(g.studentId)} en ${g.subject}?`)) {
    state.grades = state.grades.filter((x) => x.id !== g.id);
    save(); renderAll(); toast('Nota eliminada.');
  }
});
$('#gradeSearch').addEventListener('input', renderGrades);
$('#gradeFilterStudent').addEventListener('change', renderGrades);

/* =====================================================
   TAREAS
   ===================================================== */
const taskForm = $('#taskForm');

function taskRules() {
  const editing = !!taskForm.elements.id.value;
  return {
    title: (v) => !v ? 'Escribe el título.' : v.length < 3 ? 'Mínimo 3 caracteres.' : '',
    subject: (v) => (v.length > 0 && v.length < 2 ? 'Mínimo 2 caracteres.' : ''),
    due: (v) => !v ? 'Selecciona la fecha de entrega.' : (!editing && v < todayISO()) ? 'La fecha no puede ser anterior a hoy.' : '',
    priority: (v) => (v ? '' : 'Selecciona la prioridad.')
  };
}

taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate(taskForm, taskRules())) return;
  const f = taskForm.elements;
  const data = { title: f.title.value.trim(), subject: f.subject.value.trim(), due: f.due.value, priority: f.priority.value, notes: f.notes.value.trim() };
  if (f.id.value) {
    Object.assign(state.tasks.find((t) => t.id === f.id.value), data);
    toast('Tarea actualizada.');
  } else {
    state.tasks.push({ id: uid(), done: false, ...data });
    toast('Tarea guardada.');
  }
  save(); resetTaskForm(); renderAll();
});

function resetTaskForm() {
  taskForm.reset(); taskForm.elements.id.value = ''; clearErrors(taskForm);
  $('#taskFormTitle').textContent = 'Nueva tarea';
  $('#taskSubmit span').textContent = 'Guardar tarea';
  $('#taskCancel').hidden = true;
}
$('#taskCancel').addEventListener('click', resetTaskForm);
liveClear(taskForm);

function dueLabel(t) {
  if (t.done) return `<span>${fmtDate(t.due)}</span>`;
  const d = daysUntil(t.due);
  if (d < 0) return `<span class="due-late">Vencida hace ${-d} día${d === -1 ? '' : 's'}</span>`;
  if (d === 0) return '<span class="due-soon">Vence hoy</span>';
  if (d <= 2) return `<span class="due-soon">Vence en ${d} día${d === 1 ? '' : 's'}</span>`;
  return `<span>${fmtDate(t.due)}</span>`;
}

function renderTasks() {
  const st = $('#taskFilterStatus').value;
  const pr = $('#taskFilterPriority').value;
  const q = norm($('#taskSearch').value);
  const order = { alta: 0, media: 1, baja: 2 };
  const list = state.tasks
    .filter((t) => (st === 'todas' || (st === 'pendientes' ? !t.done : t.done)) && (!pr || t.priority === pr) && norm(`${t.title} ${t.subject}`).includes(q))
    .sort((a, b) => a.done - b.done || a.due.localeCompare(b.due) || order[a.priority] - order[b.priority]);
  $('#tasksList').innerHTML = list.length ? list.map((t) => `
    <li class="task p-${t.priority} ${t.done ? 'done' : ''}">
      <input type="checkbox" data-action="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Marcar como completada: ${esc(t.title)}">
      <div class="grow">
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">
          <span class="badge b-${t.priority}">${t.priority[0].toUpperCase() + t.priority.slice(1)}</span>
          ${t.subject ? `<span>${esc(t.subject)}</span>` : ''}
          ${dueLabel(t)}
          ${t.notes ? `<span>· ${esc(t.notes)}</span>` : ''}
        </div>
      </div>
      <div class="row-actions">
        <button class="mini" data-action="edit-task" data-id="${t.id}" aria-label="Editar tarea"><svg class="ic"><use href="#i-edit"/></svg></button>
        <button class="mini del" data-action="del-task" data-id="${t.id}" aria-label="Eliminar tarea"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </li>`).join('') : `<li class="empty muted" style="padding:2rem;text-align:center">${state.tasks.length ? 'Sin resultados.' : 'No tienes tareas. ¡Agrega la primera!'}</li>`;
}

$('#tasksList').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const t = state.tasks.find((x) => x.id === el.dataset.id);
  if (!t) return;
  if (el.dataset.action === 'toggle-task') {
    t.done = el.checked; save(); renderAll();
    toast(t.done ? 'Tarea completada. ¡Buen trabajo!' : 'Tarea marcada como pendiente.');
  } else if (el.dataset.action === 'edit-task') {
    const f = taskForm.elements;
    f.id.value = t.id; f.title.value = t.title; f.subject.value = t.subject; f.due.value = t.due; f.priority.value = t.priority; f.notes.value = t.notes || '';
    clearErrors(taskForm);
    $('#taskFormTitle').textContent = 'Editar tarea';
    $('#taskSubmit span').textContent = 'Guardar cambios';
    $('#taskCancel').hidden = false;
    f.title.focus();
    taskForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (await confirmBox('Eliminar tarea', `¿Eliminar "${t.title}"?`)) {
    state.tasks = state.tasks.filter((x) => x.id !== t.id);
    save(); renderAll(); toast('Tarea eliminada.');
  }
});
['taskFilterStatus', 'taskFilterPriority'].forEach((id) => $(`#${id}`).addEventListener('change', renderTasks));
$('#taskSearch').addEventListener('input', renderTasks);

/* =====================================================
   BOLETÍN
   ===================================================== */
function renderReport() {
  const id = $('#reportStudent').value;
  const s = state.students.find((x) => x.id === id);
  const box = $('#reportBody');
  if (!s) { box.innerHTML = '<p class="muted" style="text-align:center;padding:2rem">Selecciona un estudiante para ver su boletín.</p>'; return; }
  const grades = state.grades.filter((g) => g.studentId === id);
  const subjects = [...new Set(grades.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, 'es'));
  const rows = subjects.map((sub) => {
    const gs = grades.filter((g) => g.subject === sub);
    const avg = mean(gs.map((g) => g.score));
    const lv = level(avg);
    return `<tr>
      <td data-label="Materia"><strong>${esc(sub)}</strong></td>
      <td data-label="Notas">${gs.sort((a, b) => a.date.localeCompare(b.date)).map((g) => fmt(g.score)).join(' · ')}</td>
      <td data-label="Promedio"><span class="score">${fmt(avg)}</span></td>
      <td data-label="Desempeño"><span class="badge ${lv.cls}">${lv.label}</span></td></tr>`;
  }).join('');
  const total = mean(grades.map((g) => g.score));
  const lv = level(total);
  const pending = state.tasks.filter((t) => !t.done).length;
  box.innerHTML = `
    <div class="report-head">
      <div><h3>${esc(s.name)}</h3><span class="muted">Documento ${esc(s.doc)} · Curso ${esc(s.grade)}</span><br>
        <span class="badge ${lv.cls}" style="margin-top:.5rem">${lv.label}${total !== null ? (total >= PASS_SCORE ? ' · Aprueba' : ' · En riesgo') : ''}</span></div>
      <div class="report-score"><strong>${total === null ? '–' : fmt(total)}</strong><small>Promedio general · ${new Date().toLocaleDateString('es-CO')}</small></div>
    </div>
    <div class="table-wrap"><table class="table static">
      <thead><tr><th>Materia</th><th>Notas</th><th>Promedio</th><th>Desempeño</th></tr></thead>
      <tbody>${rows || '<tr><td class="empty" colspan="4">Este estudiante aún no tiene notas.</td></tr>'}</tbody>
    </table></div>
    <p class="muted" style="margin-top:1rem">Escala 0.0 – 5.0 · Superior ≥ 4.5 · Alto ≥ 4.0 · Básico ≥ 3.0 · Bajo &lt; 3.0 · Tareas pendientes en el sistema: ${pending}</p>`;
}
$('#reportStudent').addEventListener('change', renderReport);
$('#btnPrint').addEventListener('click', () => {
  if (!$('#reportStudent').value) { toast('Selecciona un estudiante primero.', true); return; }
  window.print();
});

/* =====================================================
   PANEL
   ===================================================== */
function renderDashboard() {
  const withAvg = state.students.map((s) => ({ s, avg: studentAvg(s.id) })).filter((x) => x.avg !== null);
  const overall = mean(state.grades.map((g) => g.score));
  $('#kpiStudents').textContent = state.students.length;
  $('#kpiAverage').textContent = overall === null ? '–' : fmt(overall);
  $('#kpiPass').textContent = `${withAvg.filter((x) => x.avg >= PASS_SCORE).length} / ${withAvg.filter((x) => x.avg < PASS_SCORE).length}`;
  $('#kpiTasks').textContent = state.tasks.filter((t) => !t.done).length;

  const subjects = [...new Set(state.grades.map((g) => g.subject))];
  const stats = subjects.map((sub) => ({ sub, avg: mean(state.grades.filter((g) => g.subject === sub).map((g) => g.score)) })).sort((a, b) => b.avg - a.avg);
  $('#subjectBars').innerHTML = stats.length ? stats.map((x) => `
    <div class="bar-row"><span title="${esc(x.sub)}">${esc(x.sub)}</span>
      <div class="bar-track"><div class="bar-fill ${x.avg < PASS_SCORE ? 'low' : ''}" style="width:${(x.avg / 5) * 100}%"></div></div>
      <b>${fmt(x.avg)}</b></div>`).join('') : '<p class="muted">Registra notas para ver el promedio por materia.</p>';

  const top = withAvg.sort((a, b) => b.avg - a.avg).slice(0, 5);
  $('#ranking').innerHTML = top.length ? top.map((x, i) => `
    <li><span class="pos">${i + 1}</span>${avatar(x.s.name)}
      <div class="grow"><strong>${esc(x.s.name)}</strong><small>${esc(x.s.grade)}</small></div>${scoreBadge(x.avg)}</li>`).join('')
    : '<p class="muted">Aún no hay promedios para mostrar.</p>';

  const next = state.tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  $('#upcoming').innerHTML = next.length ? next.map((t) => `
    <li><div class="grow"><strong>${esc(t.title)}</strong><small>${esc(t.subject || 'Sin materia')}</small></div>
      <span class="t-meta">${dueLabel(t)}</span><span class="badge b-${t.priority}">${t.priority}</span></li>`).join('')
    : '<p class="muted">No tienes entregas pendientes.</p>';
}

/* ---------- Selects compartidos ---------- */
function fillSelect(sel, items, firstLabel) {
  const prev = sel.value;
  sel.innerHTML = `<option value="">${firstLabel}</option>` + items.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (items.some((s) => s.id === prev)) sel.value = prev;
}
function renderSelects() {
  const sorted = [...state.students].sort(byName);
  fillSelect($('#grStudent'), sorted, 'Selecciona un estudiante…');
  fillSelect($('#gradeFilterStudent'), sorted, 'Todos los estudiantes');
  fillSelect($('#reportStudent'), sorted, 'Selecciona un estudiante…');
  const subs = [...new Set([...DEFAULT_SUBJECTS, ...state.grades.map((g) => g.subject), ...state.tasks.map((t) => t.subject).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'es'));
  $('#subjectList').innerHTML = subs.map((s) => `<option value="${esc(s)}">`).join('');
}

function renderAll() {
  renderSelects(); renderDashboard(); renderStudents(); renderGrades(); renderTasks(); renderReport();
}

/* =====================================================
   RESPALDO, IMPORTACIÓN Y DATOS DE EJEMPLO
   ===================================================== */
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
$('#btnExportJson').addEventListener('click', () => {
  download(`notapro-respaldo-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  toast('Respaldo descargado.');
});
$('#btnExportCsv').addEventListener('click', () => {
  if (!state.grades.length) { toast('No hay notas para exportar.', true); return; }
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Fecha,Estudiante,Documento,Curso,Materia,Actividad,Nota,Observacion'];
  state.grades.forEach((g) => {
    const s = state.students.find((x) => x.id === g.studentId);
    lines.push([g.date, s?.name, s?.doc, s?.grade, g.subject, g.type, g.score, g.note].map(q).join(','));
  });
  download(`notapro-notas-${todayISO()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  toast('CSV descargado.');
});
$('#fileImport').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.students) || !Array.isArray(data.grades) || !Array.isArray(data.tasks)) throw new Error('Formato inválido');
      if (await confirmBox('Importar respaldo', 'Se reemplazarán los datos actuales por los del archivo.', 'Importar')) {
        state = { students: data.students, grades: data.grades, tasks: data.tasks };
        save(); renderAll(); toast('Datos importados correctamente.');
      }
    } catch (err) { toast('El archivo no es un respaldo válido.', true); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

async function loadDemo() {
  if (state.students.length && !(await confirmBox('Cargar ejemplo', 'Esto reemplazará tus datos actuales.', 'Reemplazar'))) return;
  const names = [['Laura Gómez Ríos', 'Décimo'], ['Carlos Andrés Pérez', 'Décimo'], ['Valentina Torres', 'Noveno'], ['Juan David Moreno', 'Undécimo'], ['Sofía Ramírez', 'Noveno'], ['Mateo Herrera', 'Octavo']];
  const students = names.map(([name, grade], i) => ({ id: uid() + i, name, doc: String(1020300400 + i * 137), grade, email: `${norm(name.split(' ')[0])}@colegio.edu.co` }));
  const subjects = ['Matemáticas', 'Español', 'Ciencias Naturales', 'Inglés', 'Informática'];
  const types = ['Quiz', 'Taller', 'Parcial', 'Proyecto'];
  const base = [4.6, 3.8, 4.2, 2.6, 3.4, 4.9];
  const grades = [];
  students.forEach((s, i) => subjects.forEach((sub, j) => {
    for (let k = 0; k < 2; k++) {
      const raw = base[i] + ((j * 7 + k * 3 + i) % 5 - 2) * 0.25;
      grades.push({ id: uid() + i + j + k, studentId: s.id, subject: sub, type: types[(j + k) % 4], score: Math.min(5, Math.max(1, Math.round(raw * 10) / 10)), date: addDays(-(k * 14 + j * 2 + 3)), note: '' });
    }
  }));
  const tasks = [
    { title: 'Taller de funciones cuadráticas', subject: 'Matemáticas', due: addDays(1), priority: 'alta', notes: 'Páginas 45 a 48', done: false },
    { title: 'Ensayo sobre El Principito', subject: 'Español', due: addDays(4), priority: 'media', notes: '', done: false },
    { title: 'Informe de laboratorio', subject: 'Ciencias Naturales', due: addDays(-2), priority: 'alta', notes: 'Entregar impreso', done: false },
    { title: 'Presentación en inglés', subject: 'Inglés', due: addDays(9), priority: 'baja', notes: '', done: false },
    { title: 'Proyecto página web', subject: 'Informática', due: addDays(14), priority: 'alta', notes: 'HTML, CSS y JS', done: false },
    { title: 'Lectura capítulo 3', subject: 'Ciencias Sociales', due: addDays(-5), priority: 'baja', notes: '', done: true }
  ].map((t, i) => ({ id: uid() + 't' + i, ...t }));
  state = { students, grades, tasks };
  save(); renderAll(); toast('Datos de ejemplo cargados.');
}
$('#btnDemo').addEventListener('click', loadDemo);
$('#btnReset').addEventListener('click', async () => {
  if (await confirmBox('Borrar todo', 'Se eliminarán estudiantes, notas y tareas. Esta acción no se puede deshacer.', 'Borrar todo')) {
    state = { students: [], grades: [], tasks: [] };
    save(); resetStudentForm(); resetGradeForm(); resetTaskForm(); renderAll(); toast('Datos eliminados.');
  }
});

/* =====================================================
   INICIO
   ===================================================== */
$$('.nav-btn').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)));
$('#themeToggle').addEventListener('click', toggleTheme);
$('#themeToggleTop').addEventListener('click', toggleTheme);
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

$('#year').textContent = new Date().getFullYear();
applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
load();
resetGradeForm();
renderAll();
showView(location.hash.slice(1) || 'dashboard');
