(() => {
'use strict';
const C = window.CONFIG;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: false },
});
const app = document.getElementById('app');
const STATUS = { on_track: 'No issues', stuck: 'Stuck', waiting_on_supervisor: 'Waiting on supervisor' };
const SECTIONS = [['introduction', 'Introduction', 'I'], ['literature_review', 'Literature review', 'L'], ['methods', 'Methods', 'M'],
  ['data_collection', 'Data collection', 'D'], ['results', 'Results', 'R'], ['general_discussion', 'General discussion', 'G']];
const SSTATE = { not_started: 'Not started', in_progress: 'In progress', with_supervisor: 'Draft with supervisor', done: 'Done' };
const REMINDERS = { note: 'Meeting note reminder', snapshot: 'Complete thesis overview', checkin: 'Check-in (no update)' };
const SUPERVISOR = C.SUPERVISOR_NAME || 'Your supervisor';
const SITE = location.origin + location.pathname;
const SPECS = ['Strategic marketing', 'HDS', 'Supply-Chain', 'HFIM'];
const STALE_DAYS = 30; // flag students with no meeting note for this long

// ---------- helpers (all text goes through textContent, never innerHTML) ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const mount = (...nodes) => { app.replaceChildren(...nodes.flat().filter(Boolean)); window.scrollTo(0, 0); };
let toastTimer;
function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 4000);
}
const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = (d) => (Date.now() - new Date(d).getTime()) / 864e5;
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '–');
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || String(e), true); }
  finally { if (btn) btn.disabled = false; }
}
function field(label, name, value, opts = {}) {
  const input = opts.rows
    ? h('textarea', { name, rows: opts.rows, maxlength: opts.max, value: value || '' }, value || '')
    : h('input', { name, type: opts.type || 'text', maxlength: opts.max, value: value || '', required: opts.required });
  return h('div', {}, h('label', {}, label, opts.hint ? h('span', { class: 'hint' }, ' ' + opts.hint) : null), input);
}
const formData = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
function noteText(n) {
  return `Meeting note, ${fmtDate(n.meeting_date)}\n\nDone:\n${n.done || '-'}\n\nLook at:\n${n.look_at || '-'}\n\nQuestions:\n${n.questions || '-'}\n\nNext:\n${n.next_steps || '-'}`;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed', true); }
}
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}
function topbar(email, extra) {
  return h('header', { class: 'top' }, h('h1', {}, 'Thesis Hub'),
    h('div', { class: 'row small' }, extra, h('span', { class: 'muted' }, email),
      h('button', { class: 'ghost', onclick: () => sb.auth.signOut() }, 'Sign out')));
}

// ---------- login ----------
function loginView(msg) {
  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    run(form.querySelector('button'), async () => {
      const { error } = await sb.auth.signInWithPassword({ email: String(fd.get('email')).trim().toLowerCase(), password: String(fd.get('password')) });
      if (error) throw new Error('Wrong email or password. Ask your supervisor for a new password.');
    });
  } },
    field('Email', 'email', '', { type: 'email', required: true, max: 200 }),
    field('Password', 'password', '', { type: 'password', required: true, max: 200 }),
    h('p', {}, h('button', { type: 'submit' }, 'Log in')));
  form.querySelector('[name=email]').setAttribute('autocomplete', 'username');
  form.querySelector('[name=password]').setAttribute('autocomplete', 'current-password');
  mount(h('header', { class: 'top' }, h('h1', {}, 'Thesis Hub')),
    h('div', { class: 'card' }, h('h2', {}, 'Log in'),
      h('p', { class: 'muted' }, 'Use the email address and password your supervisor gave you. Forgot it? Ask for a new one.'),
      msg ? h('p', { class: 'hintbox' }, msg) : null, form));
}

function passwordCard() {
  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const a = String(fd.get('pw1')), b = String(fd.get('pw2'));
    run(form.querySelector('button'), async () => {
      if (a.length < 10) throw new Error('Use at least 10 characters.');
      if (a !== b) throw new Error('The two passwords do not match.');
      must(await sb.auth.updateUser({ password: a }));
      form.reset(); toast('Password changed');
    });
  } },
    field('New password', 'pw1', '', { type: 'password', required: true, max: 200, hint: '(at least 10 characters)' }),
    field('New password again', 'pw2', '', { type: 'password', required: true, max: 200 }),
    h('p', {}, h('button', { type: 'submit' }, 'Change password')));
  form.querySelectorAll('input').forEach((i) => i.setAttribute('autocomplete', 'new-password'));
  return h('div', { class: 'card' }, h('h2', {}, 'Change password'), form);
}

function progressEditor(studentId, rows, onSaved) {
  const cur = Object.fromEntries((rows || []).map((r) => [r.section, r.state]));
  const form = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const d = formData(form);
    const recs = SECTIONS.filter(([k]) => (d[k] || 'not_started') !== (cur[k] || 'not_started'))
      .map(([k]) => ({ student_id: studentId, section: k, state: d[k] }));
    if (!recs.length) return toast('No changes');
    run(form.querySelector('button'), async () => {
      must(await sb.from('section_progress').upsert(recs, { onConflict: 'student_id,section' }));
      recs.forEach((r) => { cur[r.section] = r.state; });
      toast('Progress saved'); if (onSaved) await onSaved();
    });
  } },
    h('div', { class: 'grid2' }, SECTIONS.map(([k, label]) => h('div', {}, h('label', {}, label),
      h('select', { name: k }, Object.entries(SSTATE).map(([v, l]) => h('option', { value: v, selected: (cur[k] || 'not_started') === v }, l)))))),
    h('p', {}, h('button', { type: 'submit' }, 'Save progress')));
  return form;
}

// ---------- student ----------
async function studentView(stu, email) {
  const [info, notes, progress] = await Promise.all([
    sb.from('thesis_info').select('*').eq('student_id', stu.id).maybeSingle().then(must),
    sb.from('meeting_notes').select('*, note_comments(*)').eq('student_id', stu.id)
      .order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).then(must),
    sb.from('section_progress').select('*').eq('student_id', stu.id).then(must),
  ]);
  const i = info || {};
  const last = notes[0];

  const thesisForm = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const d = formData(thesisForm);
    run(thesisForm.querySelector('button'), async () => {
      must(await sb.from('thesis_info').upsert({ student_id: stu.id, ...d, specialization: d.specialization || null, status: d.status || null }, { onConflict: 'student_id' }));
      toast('Saved');
    });
  } },
    h('label', {}, 'Specialization'),
    h('select', { name: 'specialization' }, h('option', { value: '' }, 'Choose…'),
      SPECS.map((v) => h('option', { value: v, selected: i.specialization === v }, v))),
    field('Thesis snapshot', 'snapshot', i.snapshot, { rows: 4, max: 1000,
      hint: '(2–3 sentences: your question, what or who you study, and how)' }),
    h('p', { class: 'muted small' }, 'Example: "Does a sustainability label on coffee packaging raise willingness to pay? Online experiment (about 200 participants), label vs no label, moderated by prior attitude to sustainability."'),
    field('Design', 'design', i.design, { max: 300, hint: '(e.g., 2x2 between-subject, control vs treatment with pre/post)' }),
    h('div', { class: 'grid2' },
      field('Independent variable(s)', 'iv', i.iv, { rows: 2, max: 500 }),
      field('Dependent variable(s)', 'dv', i.dv, { rows: 2, max: 500 }),
      field('Moderator(s)', 'moderator', i.moderator, { rows: 2, max: 500, hint: '(or "none")' }),
      field('Mediator(s)', 'mediator', i.mediator, { rows: 2, max: 500, hint: '(or "none")' })),
    field('Other (covariates, controls, exclusions…)', 'other_variables', i.other_variables, { rows: 2, max: 1000 }),
    h('h3', {}, 'Do you need help?'),
    h('label', {}, 'Help needed'),
    h('select', { name: 'status' }, h('option', { value: '' }, 'Choose…'),
      Object.entries(STATUS).map(([k, v]) => h('option', { value: k, selected: i.status === k }, v))),
    field('One line on what blocks you or what you need from me', 'status_note', i.status_note, { rows: 2, max: 1000 }),
    h('p', {}, h('button', { type: 'submit' }, 'Save')));

  const noteForm = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const d = formData(noteForm);
    run(noteForm.querySelector('button'), async () => {
      must(await sb.from('meeting_notes').insert({ student_id: stu.id, ...d }));
      toast('Note saved');
      await route();
    });
  } },
    last && last.next_steps ? h('div', { class: 'hintbox' }, h('strong', {}, 'Last time you planned: '), last.next_steps) : null,
    field('Meeting date', 'meeting_date', today(), { type: 'date', required: true }),
    field('Done', 'done', '', { rows: 3, max: 3000, hint: '(what you did since last time, 3–5 lines)' }),
    field('Look at', 'look_at', '', { rows: 2, max: 1000, hint: '(file and section, e.g., methodology.docx, section 2.1)' }),
    field('Questions', 'questions', '', { rows: 3, max: 3000, hint: '(your 1–3 most important questions or decisions)' }),
    field('Next', 'next_steps', '', { rows: 3, max: 3000, hint: '(what you will do before the next meeting)' }),
    h('p', {}, h('button', { type: 'submit' }, 'Save note')));

  mount(topbar(email),
    h('p', {}, 'Hi ', stu.name, '. Keep this page up to date; it is what your supervisor reads before each meeting.'),
    h('div', { class: 'card' }, h('h2', {}, 'My thesis'), thesisForm),
    h('div', { class: 'card' }, h('h2', {}, 'My progress'),
      h('p', { class: 'muted small' }, 'Update this when you start, finish a draft, or send me a draft. "Draft with supervisor" means the ball is in my court.'),
      progressEditor(stu.id, progress)),
    h('div', { class: 'card' }, h('h2', {}, 'New meeting note'),
      h('p', { class: 'muted small' }, 'Fill this in at least one day before the meeting.'), noteForm),
    h('div', { class: 'card' }, h('h2', {}, 'Past notes'),
      notes.length ? notes.map((n) => noteBlock(n, false)) : h('p', { class: 'muted' }, 'No notes yet.')),
    passwordCard());
}

function noteBlock(n, isAdmin, reload) {
  const comments = (n.note_comments || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const box = h('div', { class: 'note' },
    h('strong', {}, fmtDate(n.meeting_date)),
    [['Done', n.done], ['Look at', n.look_at], ['Questions', n.questions], ['Next', n.next_steps]].map(([l, v]) =>
      v ? h('div', {}, h('span', { class: 'muted small' }, l), h('pre', {}, v)) : null),
    comments.map((c) => h('div', { class: 'comment' }, h('strong', {}, 'Supervisor: '), c.body)),
    h('div', { class: 'row small' }, h('button', { class: 'link', onclick: () => copy(noteText(n)) }, 'Copy as text')));
  if (isAdmin) {
    const ta = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Agreed next steps or comment (visible to the student)' });
    box.append(ta, h('p', {}, h('button', { class: 'ghost', onclick: (e) => run(e.target, async () => {
      if (!ta.value.trim()) return;
      must(await sb.from('note_comments').insert({ note_id: n.id, body: ta.value.trim() }));
      toast('Comment added'); await reload();
    }) }, 'Add comment')));
  }
  return box;
}

// ---------- admin ----------
let adminTab = 'overview';
let selectedIntake = null;

async function adminView(email) {
  const intakes = must(await sb.from('intakes').select('*').order('year', { ascending: false }).order('defense'));
  if (!selectedIntake || !intakes.some((x) => x.id === selectedIntake)) selectedIntake = intakes[0]?.id || null;
  const tabs = h('div', { class: 'tabs' },
    ['overview', 'manage', 'account'].map((t) => h('button', { 'aria-current': adminTab === t ? 'page' : null, onclick: () => { adminTab = t; route(); } },
      { overview: 'Overview', manage: 'Intakes & students', account: 'My password' }[t])));
  const picker = intakes.length ? h('select', { 'aria-label': 'Intake', style: 'width:auto', onchange: (e) => { selectedIntake = e.target.value; route(); } },
    intakes.map((x) => h('option', { value: x.id, selected: x.id === selectedIntake }, x.label))) : null;
  const body = adminTab === 'overview' ? await adminOverview(selectedIntake) : adminTab === 'manage' ? await adminManage(intakes) : passwordCard();
  mount(topbar(email, picker), tabs, body);
}

function flagsFor(s) {
  const t = s.thesis_info || {};
  const out = [];
  if (!s.invited_at) out.push('Not invited yet');
  if (!t.specialization || !t.snapshot || !t.iv || !t.dv) out.push('Snapshot incomplete');
  const waiting = (s.section_progress || []).filter((p) => p.state === 'with_supervisor')
    .map((p) => SECTIONS.find((x) => x[0] === p.section)[1]);
  if (waiting.length) out.push('Draft waiting: ' + waiting.join(', '));
  const lastDate = s.meeting_notes?.map((n) => n.meeting_date).sort().pop();
  if (!lastDate) out.push('No notes yet');
  else if (daysSince(lastDate) > STALE_DAYS) out.push(`No note for ${Math.floor(daysSince(lastDate))} days`);
  return { out, lastDate, waiting };
}
// Which students a reminder type applies to when you click "Select matching"
const KIND_MATCH = {
  note: () => true,
  snapshot: (r) => !r.t.specialization || !r.t.snapshot || !r.t.iv || !r.t.dv,
  checkin: (r) => !r.lastDate || daysSince(r.lastDate) > STALE_DAYS,
};
async function fnError(error) {
  try { const j = await error.context.json(); return j.error || error.message; } catch { return error.message; }
}
function reminderMessage(kind, list, extra) {
  const one = list.length === 1;
  const greet = one ? `Hi ${list[0].s.name.split(/\s+/)[0]},` : 'Hi all,';
  const tail = (extra ? `\n${extra}\n` : '') + `\nBest,\n${SUPERVISOR}`;
  let subject, text;
  if (kind === 'note') {
    subject = 'Thesis meeting: please fill in your meeting note';
    text = `${greet}\n\nPlease fill in your meeting note at least one day before our next meeting:\n${SITE}\n\nIt takes about five minutes: what you did, what I should look at, your questions, and what you will do next.\n${tail}`;
  } else if (kind === 'snapshot') {
    const t = one ? list[0].t : {};
    const missing = one ? [!t.specialization && 'specialization', !t.snapshot && 'snapshot', !t.iv && 'IV', !t.dv && 'DV'].filter(Boolean) : [];
    subject = 'Thesis: please complete your overview';
    text = `${greet}\n\nYour thesis overview is not complete yet${missing.length ? ` (missing: ${missing.join(', ')})` : ''}. Please fill it in here:\n${SITE}\n\nI use it to prepare for our meetings.\n${tail}`;
  } else {
    subject = 'Thesis: checking in';
    text = `${greet}\n\nI have not seen an update from you in a while. Please update your progress and add a meeting note here:\n${SITE}\n\nTo book a meeting, use the MEET ME link in my email signature. Meeting is up to you; I will not remind you again about it.\n${tail}`;
  }
  return `Subject: ${subject}\n\n${text}`;
}
let lastLogins = null; // passwords from the latest create/reset; kept in memory only
function loginMessage(r) {
  return `Hi ${r.name.split(/\s+/)[0]},\n\nYour login for the Thesis Hub:\n${SITE}\nEmail: ${r.email}\nPassword: ${r.password}\n\nPlease change your password after your first login (card at the bottom of the page) and keep it to yourself.\n\nBest,\n${SUPERVISOR}`;
}
const chip = (section, state) => {
  const [, label, ab] = SECTIONS.find((x) => x[0] === section);
  return h('span', { class: 'chip ' + state, title: `${label}: ${SSTATE[state]}` }, ab);
};
const progressCells = (s) => SECTIONS.map(([k]) => chip(k, (s.section_progress || []).find((p) => p.section === k)?.state || 'not_started'));

async function adminOverview(intakeId) {
  if (!intakeId) return h('div', { class: 'card' }, 'Create an intake under "Intakes & students" first.');
  const students = must(await sb.from('students').select('*, thesis_info(*), meeting_notes(id, meeting_date), section_progress(*)').eq('intake_id', intakeId).order('name'));
  const log = students.length ? must(await sb.from('reminders_log').select('student_id, kind, sent_at').in('student_id', students.map((x) => x.id)).order('sent_at', { ascending: false })) : [];
  const lastRem = {};
  log.forEach((l) => { if (!lastRem[l.student_id]) lastRem[l.student_id] = l; });
  const rows = students.map((s) => ({ s, t: s.thesis_info || {}, ...flagsFor(s) }));
  const rank = (r) => (r.t.status === 'stuck' ? 0 : r.t.status === 'waiting_on_supervisor' ? 1 : r.waiting.length ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || a.s.name.localeCompare(b.s.name));

  const exportCsv = () => {
    const head = ['Name', 'Email', 'Specialization', 'Snapshot', 'Design', 'IV', 'DV', 'Moderator', 'Mediator', 'Other', 'Help needed', 'Help note', ...SECTIONS.map((x) => x[1]), 'Last note'];
    const lines = [head, ...rows.map((r) => [r.s.name, r.s.email, r.t.specialization, r.t.snapshot, r.t.design, r.t.iv, r.t.dv, r.t.moderator, r.t.mediator, r.t.other_variables,
      STATUS[r.t.status] || '', r.t.status_note, ...SECTIONS.map(([k]) => SSTATE[(r.s.section_progress || []).find((p) => p.section === k)?.state || 'not_started']), r.lastDate])];
    const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'thesis-overview.csv' }); a.click(); URL.revokeObjectURL(a.href);
  };

  // --- reminders bar: you copy the text and send it from your own mail ---
  const sel = new Set();
  const boxes = [];
  const kindSel = h('select', { 'aria-label': 'Reminder type', style: 'width:auto' }, Object.entries(REMINDERS).map(([k, l]) => h('option', { value: k }, l)));
  const extra = h('input', { maxlength: 300, placeholder: 'Optional extra line, e.g. "Our meeting is on 12 Nov"', 'aria-label': 'Extra line', style: 'flex:1;min-width:220px' });
  const countEl = h('span', { class: 'muted small' }, '');
  const chosen = () => rows.filter((r) => sel.has(r.s.id));
  const needSel = () => { if (!sel.size) { toast('Tick at least one student', true); return false; } return true; };
  const refresh = () => { countEl.textContent = `${sel.size} selected`; boxes.forEach((b) => { b.checked = sel.has(b.dataset.id); }); };
  const reminderBar = h('div', { class: 'card' }, h('h2', {}, 'Reminders'),
    h('div', { class: 'row' }, kindSel, extra),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'ghost', onclick: () => { sel.clear(); rows.filter((r) => r.s.invited_at && KIND_MATCH[kindSel.value](r)).forEach((r) => sel.add(r.s.id)); refresh(); } }, 'Select matching'),
      h('button', { class: 'ghost', onclick: () => { sel.clear(); refresh(); } }, 'Clear'), countEl),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'ghost', onclick: () => { if (needSel()) copy(chosen().map((r) => r.s.email).join('; ')); } }, '1. Copy emails'),
      h('button', { onclick: () => { if (needSel()) copy(reminderMessage(kindSel.value, chosen(), extra.value.trim())); } }, '2. Copy message'),
      h('button', { class: 'ghost', onclick: (e) => run(e.target, async () => {
        if (!needSel()) return;
        must(await sb.from('reminders_log').insert(chosen().map((r) => ({ student_id: r.s.id, kind: kindSel.value }))));
        toast('Marked as reminded'); await route();
      }) }, '3. Mark as sent')),
    h('p', { class: 'muted small' }, 'Tick students (or "Select matching": note = everyone; overview = incomplete snapshot; check-in = no note for 30+ days). Paste the emails into BCC in your mail app, paste the message, send, then click "Mark as sent".'));

  const clip = (v, extraClass) => h('td', { class: 'clip' + (extraClass ? ' ' + extraClass : ''), tabindex: v ? '0' : null }, v || '–');
  const table = students.length ? h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}), ['Student', 'Spec.', 'Snapshot', 'IV', 'DV', 'Moderator', 'Mediator', 'Progress', 'Help', 'Last note', 'Flags'].map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.map((r) => {
      const box = h('input', { type: 'checkbox', 'aria-label': 'Select ' + r.s.name, style: 'width:auto', onchange: (e) => { e.target.checked ? sel.add(r.s.id) : sel.delete(r.s.id); refresh(); } });
      box.dataset.id = r.s.id; boxes.push(box);
      const lr = lastRem[r.s.id];
      return h('tr', {}, h('td', {}, box),
        h('td', {}, h('button', { class: 'link', onclick: () => adminDetail(r.s.id) }, r.s.name)),
        clip(r.t.specialization, 'spec'), clip(r.t.snapshot, 'wide'), clip(r.t.iv), clip(r.t.dv), clip(r.t.moderator), clip(r.t.mediator),
        h('td', { class: 'nowrap' }, progressCells(r.s)),
        h('td', {}, r.t.status && r.t.status !== 'on_track' ? h('span', { class: 'pill ' + r.t.status }, STATUS[r.t.status]) : '–'),
        h('td', {}, fmtDate(r.lastDate)),
        h('td', {}, r.out.map((f) => h('span', { class: 'flag' }, f)), lr ? h('span', { class: 'muted small', style: 'display:block' }, `Reminded (${lr.kind}) ${fmtDate(lr.sent_at)}`) : null));
    })))) : h('p', { class: 'muted' }, 'No students in this intake yet.');
  refresh();
  return [reminderBar, h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h2', { style: 'flex:1;margin:0' }, `${students.length} student${students.length === 1 ? '' : 's'}`), h('button', { class: 'ghost', onclick: exportCsv }, 'Export CSV')),
    h('p', { class: 'muted small' }, 'Progress: ', SECTIONS.map(([, l, ab]) => `${ab} = ${l}`).join(', '), '. Grey = not started, yellow = in progress, blue = draft with you, green = done.'),
    table)];
}

async function adminDetail(studentId) {
  const { data: { session } } = await sb.auth.getSession();
  const reload = () => adminDetail(studentId);
  const [s, notes] = await Promise.all([
    sb.from('students').select('*, thesis_info(*), section_progress(*)').eq('id', studentId).single().then(must),
    sb.from('meeting_notes').select('*, note_comments(*)').eq('student_id', studentId)
      .order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).then(must),
  ]);
  const t = s.thesis_info || {};
  const row = (l, v) => h('tr', {}, h('th', {}, l), h('td', {}, v || '–'));
  const kindSel = h('select', { 'aria-label': 'Reminder type', style: 'width:auto' }, Object.entries(REMINDERS).map(([k, l]) => h('option', { value: k }, l)));
  mount(topbar(session.user.email, h('button', { class: 'ghost', onclick: () => route() }, '← Back')),
    h('div', { class: 'card' }, h('h2', {}, s.name), h('p', { class: 'muted small' }, s.email),
      h('table', {}, h('tbody', {},
        row('Specialization', t.specialization), row('Snapshot', t.snapshot), row('Design', t.design), row('IV', t.iv), row('DV', t.dv),
        row('Moderator', t.moderator), row('Mediator', t.mediator), row('Other', t.other_variables),
        row('Help needed', t.status ? STATUS[t.status] : ''), row('Help note', t.status_note), row('Updated', fmtDate(t.updated_at)))),
      h('div', { class: 'row', style: 'margin-top:12px' }, kindSel,
        h('button', { class: 'ghost', onclick: () => copy(reminderMessage(kindSel.value, [{ s, t }], '')) }, 'Copy reminder'),
        h('button', { class: 'link', onclick: () => copy(s.email) }, 'Copy email'))),
    h('div', { class: 'card' }, h('h2', {}, 'Progress'), progressEditor(s.id, s.section_progress, reload)),
    h('div', { class: 'card' }, h('h2', {}, 'Meeting notes'),
      notes.length ? notes.map((n) => noteBlock(n, true, reload)) : h('p', { class: 'muted' }, 'No notes yet.')));
}

async function createLogins(ids) {
  if (!ids.length) return toast('Nobody selected');
  const { data, error } = await sb.functions.invoke('invite', { body: { student_ids: ids } });
  if (error) throw new Error(await fnError(error));
  const res = data.results || [];
  lastLogins = res.filter((r) => r.ok);
  const bad = res.filter((r) => !r.ok);
  toast(`Logins ready: ${lastLogins.length}${bad.length ? `, failed ${bad.length}: ${bad[0].name}: ${bad[0].error}` : ''}`, bad.length > 0);
}

function parseStudents(text) {
  const ok = [], bad = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
    const email = parts.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
    const name = parts.filter((p) => p !== email).join(' ');
    (email && name ? ok : bad).push(email && name ? { name, email: email.toLowerCase() } : line);
  }
  return { ok, bad };
}

async function adminManage(intakes) {
  const yr = new Date().getFullYear();
  const newIntake = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const d = formData(newIntake);
    run(newIntake.querySelector('button'), async () => {
      const row = must(await sb.from('intakes').insert({ defense: d.defense, year: Number(d.year), label: `${d.defense} ${d.year} defenses` }).select().single());
      selectedIntake = row.id; toast('Intake created'); await route();
    });
  } },
    h('div', { class: 'row' },
      h('select', { name: 'defense', 'aria-label': 'Defense month', style: 'width:auto' }, h('option', {}, 'June'), h('option', {}, 'January')),
      h('input', { name: 'year', type: 'number', min: 2024, max: 2100, value: yr + 1, style: 'width:100px', 'aria-label': 'Year' }),
      h('button', { type: 'submit' }, 'Create intake')));
  const cards = [];
  if (lastLogins && lastLogins.length) {
    const shown = lastLogins;
    cards.push(h('div', { class: 'card' }, h('h2', {}, 'New passwords (shown once)'),
      h('p', { class: 'muted small' }, 'Copy each message now and send it to the student. Passwords are not stored and disappear when you leave this page.'),
      h('div', { class: 'tablewrap' }, h('table', {}, h('tbody', {}, shown.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.email),
        h('td', {}, h('code', {}, r.password)), h('td', {}, h('button', { class: 'ghost', onclick: () => copy(loginMessage(r)) }, 'Copy message'))))))),
      h('p', {}, h('button', { class: 'ghost', onclick: () => { lastLogins = null; route(); } }, 'Done, hide passwords'))));
  }
  cards.push(h('div', { class: 'card' }, h('h2', {}, 'New intake'), newIntake));
  if (!selectedIntake) return cards;

  const intake = intakes.find((x) => x.id === selectedIntake);
  const students = must(await sb.from('students').select('*').eq('intake_id', selectedIntake).order('name'));
  const ta = h('textarea', { rows: 5, placeholder: 'One student per line:\nAnn Smith, ann@student.maastrichtuniversity.nl' });
  const addBtn = h('button', { onclick: (e) => run(e.target, async () => {
    const { ok, bad } = parseStudents(ta.value);
    if (bad.length) throw new Error('Could not read: ' + bad.slice(0, 2).join(' | '));
    if (!ok.length) throw new Error('Nothing to add');
    must(await sb.from('students').insert(ok.map((x) => ({ ...x, intake_id: selectedIntake }))));
    toast(`Added ${ok.length}`); await route();
  }) }, 'Add students');
  const uninvited = students.filter((s) => !s.invited_at).map((s) => s.id);
  cards.push(h('div', { class: 'card' }, h('h2', {}, 'Students in ' + intake.label), ta, h('p', {}, addBtn),
    students.length ? h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Name', 'Email', 'Login created', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, students.map((s) => h('tr', {}, h('td', {}, s.name), h('td', {}, s.email), h('td', {}, fmtDate(s.invited_at)),
        h('td', {}, h('div', { class: 'row' },
          h('button', { class: 'ghost', onclick: (e) => run(e.target, async () => { if (s.invited_at && !confirm(`Set a new password for ${s.name}? The old one stops working.`)) return; await createLogins([s.id]); await route(); }) }, s.invited_at ? 'New password' : 'Create login'),
          h('button', { class: 'danger', onclick: (e) => run(e.target, async () => {
            if (!confirm(`Delete ${s.name} and all their data?`)) return;
            must(await sb.from('students').delete().eq('id', s.id)); await route();
          }) }, 'Delete')))))))) : null,
    uninvited.length ? h('p', {}, h('button', { onclick: (e) => run(e.target, async () => { await createLogins(uninvited); await route(); }) }, `Create logins for all ${uninvited.length} without one`)) : null));
  cards.push(h('div', { class: 'card' }, h('h2', {}, 'After the defenses'),
    h('p', { class: 'muted small' }, 'Deletes this intake, its students, theses and notes. This cannot be undone. Export the overview CSV first if you need it.'),
    h('button', { class: 'danger', onclick: (e) => run(e.target, async () => {
      if (!confirm(`Delete "${intake.label}" and ALL its student data?`)) return;
      must(await sb.from('intakes').delete().eq('id', intake.id)); selectedIntake = null; await route();
    }) }, 'Delete this intake and its data')));
  return cards;
}

// ---------- routing ----------
async function route() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { lastLogins = null; return loginView(); }
    const email = session.user.email;
    const isAdmin = must(await sb.rpc('is_admin'));
    if (isAdmin) return await adminView(email);
    const stu = must(await sb.from('students').select('*').maybeSingle());
    if (!stu) {
      await sb.auth.signOut();
      return loginView('This email is not registered for this app. Ask your supervisor to add you.');
    }
    return await studentView(stu, email);
  } catch (e) {
    toast(e.message || String(e), true);
  }
}
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') setTimeout(route, 0);
});
})();
