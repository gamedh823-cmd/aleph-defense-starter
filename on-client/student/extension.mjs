// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ---- 공통: 화면 표기와 보기 좋은 모양 ----
// 단계가 바뀔 때마다 이 두 줄만 바꿉니다.
const AGENT_NAME = '등대, 낯선 접속을 가장 먼저 알아보다';
const STAGE_LABEL = '4차 방어전 · 15단계';

// 제공 CSS 는 건드리지 않고, 학생 칸의 모양은 여기서 요소별로 입힙니다(style-src 'self' 에서도 CSSOM 은 허용).
// 라이트·다크 두 벌의 색을 두고, 학생 칸 배너의 버튼으로 고릅니다. 선택값은 주소 뒤 #theme=… 에만 둡니다.
const PALETTES = {
  light: {
    text: '#1c2533', muted: '#556070', cardBg: '#ffffff', cardLine: '#cfd6e2',
    bannerBg: '#1f2a44', bannerText: '#ffffff',
    tones: {
      ok: { background: '#e7f6ec', color: '#0b5d2a', border: '1px solid #78c490' },
      warn: { background: '#fff3df', color: '#8a4b00', border: '1px solid #efb359' },
      bad: { background: '#fde8e8', color: '#9f1212', border: '1px solid #e58a8a' },
      info: { background: '#e8f0fe', color: '#1a3f8f', border: '1px solid #8fb0f2' },
      neutral: { background: '#eef1f5', color: '#2f3744', border: '1px solid #b7c0cc' },
    },
  },
  dark: {
    text: '#ecf4ff', muted: '#a9b8cc', cardBg: '#16233a', cardLine: '#3c5170',
    bannerBg: '#0b1220', bannerText: '#ffffff',
    tones: {
      ok: { background: '#12392a', color: '#9be8c5', border: '1px solid #2f7d5b' },
      warn: { background: '#4a3510', color: '#ffd28a', border: '1px solid #a8741f' },
      bad: { background: '#4a1b22', color: '#ffb3bd', border: '1px solid #a8434f' },
      info: { background: '#1b2e55', color: '#b9d0ff', border: '1px solid #4a6fb5' },
      neutral: { background: '#2a3442', color: '#d5dde8', border: '1px solid #5b6b80' },
    },
  },
};

function initialTheme() {
  try {
    const match = /theme=(light|dark)/u.exec(globalThis.location?.hash ?? '');
    if (match) return match[1];
  } catch { /* 주소를 읽지 못하면 라이트로 시작합니다. */ }
  return 'light';
}

let theme = initialTheme();
let redraw = () => {}; // createStudentView 가 앱의 onChange 를 받아 채웁니다.
const palette = () => PALETTES[theme];

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  try {
    if (globalThis.history && globalThis.location) {
      globalThis.history.replaceState(null, '', `${globalThis.location.pathname}${globalThis.location.search}#theme=${theme}`);
    }
  } catch { /* 주소를 바꾸지 못해도 이번 화면에서는 바뀝니다. */ }
  redraw();
}

function paint(element, css) {
  if (element.style) Object.assign(element.style, css);
  return element;
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

const asText = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 보조 문장(제공 CSS 의 muted 색은 다크 바탕에서 흐려서 직접 색을 정합니다).
function mutedNote(text) {
  return paint(node('p', text, 'muted'), { color: palette().muted, lineHeight: '1.5' });
}

// 색은 보조일 뿐이고, 상태는 항상 글자로도 적습니다.
function badge(text, tone, big = false) {
  return paint(node('span', text), {
    ...palette().tones[tone],
    display: 'inline-block',
    padding: big ? '6px 14px' : '2px 10px',
    borderRadius: '999px',
    fontWeight: '700',
    fontSize: big ? '1.15rem' : '0.95rem',
    lineHeight: '1.5',
  });
}

function box(text, tone, className) {
  return paint(node('p', text, className), {
    ...palette().tones[tone],
    padding: '10px 14px',
    borderRadius: '8px',
    margin: '6px 0',
    fontWeight: '600',
    lineHeight: '1.5',
  });
}

function card() {
  const p = palette();
  return paint(node('section'), {
    padding: '12px 16px',
    margin: '10px 0',
    border: `1px solid ${p.cardLine}`,
    borderRadius: '10px',
    background: p.cardBg,
    color: p.text,
  });
}

function cardTitle(text) {
  return paint(node('h3', text), { margin: '0 0 8px', fontSize: '1.05rem', fontWeight: '800', color: palette().text });
}

// ---- 13단계: 로그인 사용자·기기·세션 표시 ----
// 상태값은 API 계약 그대로 두고, 화면 문구만 한국어로 바꿉니다.
const DEVICE_LABELS = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_LABELS = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const MODE_LABELS = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
const MODE_TONES = { demo: 'warn', disconnected: 'bad', unknown: 'neutral' };
const NORMAL_STATES = new Set(['compliant', 'active']); // 그 밖의 값은 정상처럼 보이지 않게 합니다.
const BAD_STATES = new Set(['noncompliant', 'expired', 'revoked']);

// 한국어 뜻과 원래 상태값을 함께 적습니다. 목록에 없는 값은 확인 불가로 읽습니다.
function stateText(labels, value) {
  const code = asText(value);
  return `${Object.hasOwn(labels, code) ? labels[code] : labels.unknown} (${code || 'unknown'})`;
}

// 정상이 아니거나 확인할 수 없는 상태에는 색이 아니라 글자로 "주의"를 붙입니다.
function stateLine(labels, value) {
  const code = asText(value);
  const tone = NORMAL_STATES.has(code) ? 'ok' : BAD_STATES.has(code) ? 'bad' : 'warn';
  const line = badge(`${NORMAL_STATES.has(code) ? '' : '주의: '}${stateText(labels, value)}`, tone);
  line.dataset.studentState = code || 'unknown';
  return line;
}

// 제공 UI 의 목록 모양(dl.kv 아래 dt·dd 가 바로 이어짐)과 같게 만듭니다.
function joined(parts) {
  const holder = paint(node('span'), { color: palette().text });
  parts.forEach((part, index) => {
    if (index > 0) holder.append(' · ');
    holder.append(part);
  });
  return holder;
}

function addRow(list, term, ...parts) {
  const detail = paint(node('dd'), { color: palette().text });
  detail.append(joined(parts));
  list.append(paint(node('dt', term), { fontWeight: '700', color: palette().muted }), detail);
}

function drawMe(data) {
  if (!isRecord(data) || !isRecord(data.user) || !isRecord(data.device) || !isRecord(data.session)) {
    return box('확인 불가: 응답 형식이 맞지 않아 사용자·기기·세션을 표시하지 않습니다.', 'bad', 'state state-error');
  }
  const { user, device, session } = data;
  const list = node('dl', undefined, 'kv');
  addRow(list, '사용자', paint(node('strong', asText(user.label) || asText(user.id) || '확인 불가'), { fontSize: '1.1rem' }), `ID ${asText(user.id)}`);
  addRow(list, '현재 기기', asText(device.label) || asText(device.id) || '확인 불가', stateLine(DEVICE_LABELS, device.status), `ID ${asText(device.id)}`);
  addRow(list, '현재 세션', `ID ${asText(session.id)}`, stateLine(SESSION_LABELS, session.status));
  return list;
}

function drawList(items, emptyText, describe) {
  if (!Array.isArray(items)) return box('확인 불가: 응답 형식이 맞지 않습니다.', 'bad', 'state state-error');
  if (items.length === 0) return box(emptyText, 'neutral', 'state state-empty');
  const list = paint(node('ul', undefined, 'plain-list'), { margin: '0', paddingLeft: '18px', lineHeight: '1.9', color: palette().text });
  for (const item of items) {
    const entry = paint(node('li'), { color: palette().text });
    if (!isRecord(item)) {
      entry.textContent = '확인 불가: 항목 형식이 맞지 않습니다.';
    } else {
      describe(entry, item);
    }
    list.append(entry);
  }
  return list;
}

const drawDevices = (data) => drawList(data, '표시할 기기가 없습니다.', (entry, device) => {
  entry.append(joined([asText(device.label) || asText(device.id) || '확인 불가', stateLine(DEVICE_LABELS, device.status), `ID ${asText(device.id)}`]));
});

const drawSessions = (data) => drawList(data, '표시할 세션이 없습니다.', (entry, session) => {
  entry.append(joined([`ID ${asText(session.id)}`, stateLine(SESSION_LABELS, session.status)]));
});

function modeNote(mode) {
  if (!Object.hasOwn(MODE_LABELS, mode)) return null;
  return paint(badge(`${MODE_LABELS[mode]} (${mode})`, MODE_TONES[mode]), { marginBottom: '8px' });
}

// 자료 하나(me·devices·sessions)의 loading / ok / error 를 각각 처리합니다. 매번 새 DOM 을 만들어 돌려줍니다.
function drawResource(title, resource, draw) {
  const section = card();
  section.append(cardTitle(title));
  const res = isRecord(resource) ? resource : {};
  const note = modeNote(res.mode);
  if (note) section.append(note);
  if (res.status === 'loading') {
    section.append(box('불러오는 중…', 'info', 'state state-loading'));
  } else if (res.status === 'error') {
    const message = asText(isRecord(res.error) ? res.error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    section.append(box(`연결 실패: ${message}`, 'bad', 'state state-error'));
    section.append(mutedNote('확인할 수 없습니다. 이전에 보이던 값은 현재 값이 아니므로 표시하지 않습니다.'));
  } else if (res.status === 'ok') {
    section.append(draw(res.data));
  } else {
    section.append(box('확인 불가: 상태를 받지 못했습니다.', 'bad', 'state state-error'));
  }
  return section;
}

// 배너: 현재 차수·단계, 보안 Agent 이름, 라이트·다크 선택 버튼.
function stageBanner() {
  const p = palette();
  const banner = paint(node('div'), {
    background: p.bannerBg,
    color: p.bannerText,
    padding: '12px 16px',
    borderRadius: '10px',
    lineHeight: '1.5',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    border: `1px solid ${p.cardLine}`,
  });
  const titles = node('div');
  titles.append(
    paint(node('div', STAGE_LABEL), { fontSize: '0.9rem', opacity: '0.85', fontWeight: '600' }),
    paint(node('div', AGENT_NAME), { fontSize: '1.2rem', fontWeight: '800' }),
  );
  const toggle = paint(node('button', theme === 'dark' ? '라이트 모드로 보기' : '다크 모드로 보기'), {
    background: 'transparent',
    color: p.bannerText,
    border: '1px solid rgba(255, 255, 255, 0.7)',
    borderRadius: '8px',
    padding: '6px 12px',
    fontWeight: '700',
    cursor: 'pointer',
  });
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  toggle.addEventListener('click', toggleTheme);
  banner.append(titles, toggle);
  return banner;
}

function renderIdentity(input) {
  const { me, devices, sessions } = isRecord(input) ? input : {};
  const root = node('section', undefined, 'student-identity');
  root.setAttribute('aria-label', '로그인 사용자·기기·세션');
  root.append(
    stageBanner(),
    drawResource('현재 로그인', me, drawMe),
    drawResource('내 기기 목록', devices, drawDevices),
    drawResource('세션 목록', sessions, drawSessions),
  );
  return root;
}

// ---- 14단계: 업무 앱 접근 판정 표시 ----
// 서버가 돌려준 decision 만 보여 줍니다. 네 값이 아니거나 unknown 이면 허용으로 읽히지 않게 확인 불가로 표시합니다.
const DECISION_VIEWS = {
  allow: { label: '접근 허용', tone: 'ok', note: '정책상 접근이 허용되었습니다. 실제 앱 접속 성공을 보장하지 않습니다.' },
  deny: { label: '접근 거부', tone: 'bad', note: '정책상 접근이 거부되었습니다. 허용되지 않았습니다.' },
  challenge: { label: '추가 인증 또는 확인 필요', tone: 'warn', note: '추가 인증 또는 확인이 필요합니다. 이 화면은 확인 절차를 대신 수행하지 않으며, 아직 허용되지 않았습니다.' },
  unknown: { label: '판정 확인 불가', tone: 'neutral', note: '판정을 확인할 수 없습니다. 허용으로 간주하지 마세요.' },
};
const SAFE_DECISION_TEXT_LIMIT = 40;

function drawDecision(data, fallbackAppId) {
  if (!isRecord(data)) {
    return [box('판정 확인 불가 (unknown): 응답 형식이 맞지 않습니다. 허용으로 간주하지 마세요.', 'bad', 'state state-error')];
  }
  const code = asText(data.decision);
  const known = Object.hasOwn(DECISION_VIEWS, code);
  const view = DECISION_VIEWS[known ? code : 'unknown'];
  const shownCode = known ? code : 'unknown';
  const headline = paint(node('p', undefined, `decision decision-${shownCode}`), { margin: '6px 0' });
  headline.dataset.studentDecision = shownCode;
  headline.append(badge(`${view.label} (${shownCode})`, view.tone, true));
  const parts = [headline, paint(node('p', view.note), { fontWeight: '600', lineHeight: '1.5', color: palette().text })];
  if (!known) {
    parts.push(mutedNote(`서버가 알 수 없는 판정값을 보냈습니다: ${code.slice(0, SAFE_DECISION_TEXT_LIMIT) || '(비어 있음)'}`));
  }
  const detail = node('dl', undefined, 'kv');
  addRow(detail, '업무 앱', asText(data.appId) || asText(fallbackAppId) || '확인 불가');
  addRow(detail, '판정 이유', asText(data.reason) || '이유 정보 없음');
  addRow(detail, '판정 시각', asText(data.checkedAt) || '시각 정보 없음');
  parts.push(detail);
  return parts;
}

function renderDecision(input) {
  const { status, mode, data, error, appId } = isRecord(input) ? input : {};
  const root = card();
  root.className = 'student-decision';
  root.setAttribute('aria-label', '업무 앱 접근 판정');
  root.append(cardTitle('업무 앱 접근 판정'));
  const note = modeNote(mode);
  if (note) root.append(note);
  const appText = asText(appId);
  if (status === 'idle') {
    root.append(box('앱을 골라 접속을 요청하세요. 아직 요청한 판정이 없습니다.', 'neutral', 'state state-empty'));
  } else if (status === 'loading') {
    root.append(box(`판정 확인 중${appText ? ` (${appText})` : ''}`, 'info', 'state state-loading'));
  } else if (status === 'error') {
    const message = asText(isRecord(error) ? error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    const failure = box(`요청 실패: ${message}`, 'bad', 'state state-error');
    failure.dataset.studentDecision = 'request-failed';
    root.append(failure);
    root.append(mutedNote('이 결과는 접근 거부 판정이 아닙니다. 요청이 실패해 판정을 확인할 수 없으며, 허용된 것도 아닙니다.'));
  } else if (status === 'ok') {
    root.append(...drawDecision(data, appText));
  } else {
    root.append(box('판정 확인 불가 (unknown): 상태를 받지 못했습니다. 허용으로 간주하지 마세요.', 'bad', 'state state-error'));
  }
  return root;
}

// ---- 15단계: 내 접속 기록과 XDR 경보 ----
// 받은 배열을 복사해 최신순으로 보여 주고, 걸러 보기와 상세 보기는 받은 배열 안에서만 합니다. 서버에 다시 묻지 않습니다.
const KIND_LABELS = { access: '접속 기록', xdr: 'XDR 경보' };
const ACCESS_LABELS = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
const EVENTS_SCOPE_NOTE = '본인의 최근 기록(최대 40건)만 보입니다. 전체 직원의 이력이나 실시간 전체 위협 탐지가 아니며, XDR 경보는 서버가 이미 저장한 경보만 표시합니다.';
const MISSING_APP_TEXT = '앱을 확인할 수 없음 (appId 없음)';

// 걸러 보기·상세 선택은 같은 자료가 다시 그려질 때만 유지하고, 불러오는 중·실패에서는 지웁니다.
let eventsView = { kind: 'all', appId: 'all', access: 'all', selectedId: null };
const resetEventsView = () => { eventsView = { kind: 'all', appId: 'all', access: 'all', selectedId: null }; };

const kindText = (kind) => {
  const code = asText(kind);
  return Object.hasOwn(KIND_LABELS, code) ? `${KIND_LABELS[code]} (${code})` : `종류 확인 불가 (${code || 'unknown'})`;
};

function formatAt(at) {
  const raw = asText(at);
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return `시각 확인 불가 (원본 ${raw || '없음'})`;
  const korean = new Date(time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  return `${korean} (한국 시각) · 원본 ${raw}`;
}

// 원본 배열을 바꾸지 않고 at 기준 최신순으로 복사합니다. 시각을 읽을 수 없는 기록은 맨 뒤에 둡니다.
function sortedEvents(data) {
  const rows = data.filter(isRecord).map((event, index) => ({ event, index, time: Date.parse(asText(event.at)) }));
  rows.sort((a, b) => {
    const aOk = Number.isFinite(a.time);
    const bOk = Number.isFinite(b.time);
    if (aOk && bOk && a.time !== b.time) return b.time - a.time;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return a.index - b.index;
  });
  return rows.map((row) => row.event);
}

const uniqueValues = (events, pick) => [...new Set(events.map(pick).filter((value) => value !== ''))];

function accessibleButton(text, onClick) {
  const button = paint(node('button', text), {
    background: 'transparent',
    color: palette().text,
    border: `1px solid ${palette().cardLine}`,
    borderRadius: '8px',
    padding: '4px 10px',
    fontWeight: '700',
    cursor: 'pointer',
  });
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function listBlock(title, items, describe, emptyText) {
  const block = node('div');
  block.append(paint(node('strong', title), { color: palette().text }));
  if (!Array.isArray(items) || items.length === 0) {
    block.append(mutedNote(emptyText));
    return block;
  }
  const list = paint(node('ul', undefined, 'plain-list'), { margin: '4px 0 8px', paddingLeft: '18px', color: palette().text });
  for (const item of items) {
    const entry = paint(node('li'), { color: palette().text });
    entry.textContent = isRecord(item) ? describe(item) : '확인 불가: 항목 형식이 맞지 않습니다.';
    list.append(entry);
  }
  block.append(list);
  return block;
}

function drawEventDetail(event) {
  const id = asText(event.id) || '(id 없음)';
  const detail = paint(node('div'), {
    marginTop: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${palette().cardLine}`,
    background: theme === 'dark' ? '#0f1a2e' : '#f6f8fb',
    color: palette().text,
  });
  detail.dataset.studentEventDetail = id;
  const state = isRecord(event.state) ? event.state : {};
  const facts = node('dl', undefined, 'kv');
  addRow(facts, '사건 ID', id);
  addRow(facts, '업무 앱', asText(event.appId) || MISSING_APP_TEXT);
  addRow(facts, '접속 상태', stateLineWith(ACCESS_LABELS, state.access, { allowed: 'ok', denied: 'bad' }));
  addRow(facts, '세션 상태', stateLine(SESSION_LABELS, state.session));
  addRow(facts, '기기 상태', stateLine(DEVICE_LABELS, state.device));
  detail.append(
    facts,
    listBlock('근거', event.evidence, (item) => `${asText(item.id) || '(id 없음)'}: ${asText(item.text) || '내용 없음'}`, '근거 정보가 없습니다.'),
    listBlock('적용된 규칙', event.rules, (item) => `${asText(item.id) || '(id 없음)'}: ${asText(item.text) || '내용 없음'}`, '규칙 정보가 없습니다.'),
  );
  return detail;
}

// 접속 상태처럼 값마다 색을 정하는 배지(글자로도 뜻과 원래 값을 함께 적습니다).
function stateLineWith(labels, value, tones) {
  const code = asText(value);
  const line = badge(`${Object.hasOwn(labels, code) && code !== 'unknown' ? '' : '주의: '}${stateText(labels, value)}`, tones[code] ?? 'warn');
  line.dataset.studentState = code || 'unknown';
  return line;
}

function drawEventRow(event, onToggle) {
  const id = asText(event.id) || '(id 없음)';
  const state = isRecord(event.state) ? event.state : {};
  const row = paint(node('li'), {
    display: 'block', // 제공 CSS 의 .plain-list li(가로 배치)를 쓰지 않습니다.
    listStyle: 'none',
    margin: '8px 0',
    padding: '10px 12px',
    border: `1px solid ${palette().cardLine}`,
    borderRadius: '10px',
    color: palette().text,
  });
  row.dataset.studentEventId = id;
  const head = paint(node('div'), { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' });
  head.append(
    paint(node('strong', id), { fontSize: '1.02rem' }),
    badge(kindText(event.kind), event.kind === 'xdr' ? 'warn' : 'info'),
    stateLineWith(ACCESS_LABELS, state.access, { allowed: 'ok', denied: 'bad' }),
  );
  const facts = node('dl', undefined, 'kv');
  addRow(facts, '시각', formatAt(event.at));
  addRow(facts, '업무 앱', asText(event.appId) || MISSING_APP_TEXT);
  addRow(facts, '요약', asText(event.summary) || '요약 없음');
  const expanded = eventsView.selectedId === id;
  const toggle = accessibleButton(`${id} 상세`, () => onToggle(id));
  toggle.dataset.studentDetailButton = id;
  toggle.setAttribute('aria-expanded', String(expanded));
  row.append(head, facts, toggle);
  if (expanded) row.append(drawEventDetail(event));
  return row;
}

function filterSelect(labelText, key, options, onChange) {
  const wrap = paint(node('div'), { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '150px' });
  const id = `student-events-filter-${key}`;
  const label = paint(node('label', labelText), { fontWeight: '700', color: palette().text });
  label.htmlFor = id;
  const select = paint(node('select'), {
    background: palette().cardBg,
    color: palette().text,
    border: `1px solid ${palette().cardLine}`,
    borderRadius: '8px',
    padding: '6px 8px',
  });
  select.id = id;
  for (const [value, text] of [['all', '전체 (all)'], ...options]) {
    const option = node('option', text);
    option.value = value;
    select.append(option);
  }
  select.value = eventsView[key];
  select.addEventListener('change', () => onChange(key, select.value));
  wrap.append(label, select);
  return wrap;
}

function drawEventsBody(root, data) {
  const events = sortedEvents(data);
  const kinds = uniqueValues(events, (e) => asText(e.kind));
  const apps = uniqueValues(events, (e) => asText(e.appId));
  const accesses = uniqueValues(events, (e) => asText(isRecord(e.state) ? e.state.access : ''));
  // 이전에 고른 값이 새 자료에 없으면 전체로 돌립니다.
  if (eventsView.kind !== 'all' && !kinds.includes(eventsView.kind)) eventsView.kind = 'all';
  if (eventsView.appId !== 'all' && !apps.includes(eventsView.appId)) eventsView.appId = 'all';
  if (eventsView.access !== 'all' && !accesses.includes(eventsView.access)) eventsView.access = 'all';
  if (eventsView.selectedId !== null && !events.some((e) => (asText(e.id) || '(id 없음)') === eventsView.selectedId)) eventsView.selectedId = null;

  const filters = paint(node('div'), { display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '8px 0' });
  const count = paint(node('p'), { fontWeight: '700', margin: '6px 0', color: palette().text });
  const host = paint(node('ul'), { margin: '0', padding: '0', listStyle: 'none' });

  const refresh = () => {
    const visible = events.filter((event) => {
      const state = isRecord(event.state) ? event.state : {};
      return (eventsView.kind === 'all' || asText(event.kind) === eventsView.kind)
        && (eventsView.appId === 'all' || asText(event.appId) === eventsView.appId)
        && (eventsView.access === 'all' || asText(state.access) === eventsView.access);
    });
    count.textContent = `표시 ${visible.length}건 / 받은 기록 ${events.length}건`;
    host.textContent = '';
    if (visible.length === 0) {
      host.append(box('선택한 조건에 맞는 기록이 없습니다. 필터를 「전체」로 바꿔 보세요.', 'neutral', 'state state-empty'));
      return;
    }
    for (const event of visible) host.append(drawEventRow(event, toggleDetail));
  };

  function toggleDetail(id) {
    eventsView.selectedId = eventsView.selectedId === id ? null : id;
    refresh();
    // 목록을 다시 그려도 키보드 사용자가 같은 버튼에서 이어서 조작할 수 있게 포커스를 돌려줍니다.
    if (typeof host.querySelectorAll === 'function') {
      const again = [...host.querySelectorAll('button')].find((button) => button.dataset.studentDetailButton === id);
      if (again && typeof again.focus === 'function') again.focus();
    }
  }

  const onFilter = (key, value) => {
    eventsView[key] = value;
    refresh();
  };
  filters.append(
    filterSelect('기록 종류', 'kind', kinds.map((k) => [k, kindText(k)]), onFilter),
    filterSelect('업무 앱', 'appId', apps.map((a) => [a, a]), onFilter),
    filterSelect('접속 상태', 'access', accesses.map((a) => [a, stateText(ACCESS_LABELS, a)]), onFilter),
  );
  root.append(filters, count, host);
  refresh();
}

function renderEvents(input) {
  const { status, mode, data, error } = isRecord(input) ? input : {};
  const root = card();
  root.className = 'student-events';
  root.setAttribute('aria-label', '내 접속 기록과 XDR 경보');
  root.append(cardTitle('내 접속 기록과 XDR 경보'), mutedNote(EVENTS_SCOPE_NOTE));
  const note = modeNote(mode);
  if (note) root.append(note);
  if (status !== 'ok') resetEventsView(); // 불러오는 중이거나 실패하면 이전 걸러 보기·상세 선택을 지웁니다.
  if (status === 'loading') {
    root.append(box('기록을 불러오는 중…', 'info', 'state state-loading'));
  } else if (status === 'error') {
    const message = asText(isRecord(error) ? error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    const code = asText(isRecord(error) ? error.code : '');
    root.append(box(`기록을 불러오지 못했습니다: ${message}`, 'bad', 'state state-error'));
    const unverified = code === 'CONTRACT_MISMATCH' || code === 'ENGINE_RESULT_UNVERIFIED';
    root.append(mutedNote(unverified
      ? '서버 응답 형식이 맞지 않아 확인 불가(unknown)입니다. 이전에 보이던 목록은 지웠고, 기록이 없다는 뜻도 아닙니다.'
      : '이 화면은 기록이 없는 경우가 아니라 불러오기에 실패한 경우입니다. 이전에 보이던 목록은 현재 결과가 아니므로 표시하지 않습니다.'));
  } else if (status === 'ok' && Array.isArray(data)) {
    if (data.length === 0) {
      root.append(box('표시할 기록이 없습니다.', 'neutral', 'state state-empty'));
      root.append(mutedNote('불러오기는 성공했고 조회 범위 안에 기록이 없습니다. 실패가 아닙니다.'));
    } else {
      drawEventsBody(root, data);
    }
  } else if (status === 'ok') {
    root.append(box('확인 불가: 응답 형식이 맞지 않아 기록을 표시하지 않습니다.', 'bad', 'state state-error'));
  } else {
    root.append(box('확인 불가: 상태를 받지 못했습니다.', 'bad', 'state state-error'));
  }
  return root;
}

export function createStudentView(context) {
  // 앱이 주는 onChange 를 부르면 학생 표시 함수가 최신 자료로 다시 그려집니다(테마를 바꿀 때 씁니다).
  redraw = typeof context?.onChange === 'function' ? context.onChange : () => {};
  return {
    renderIdentity,
    renderDecision,
    renderEvents,
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
