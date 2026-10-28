// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ---- 공통: 화면 표기와 보기 좋은 모양 ----
// 단계가 바뀔 때마다 이 두 줄만 바꿉니다.
const AGENT_NAME = '등대, 낯선 접속을 가장 먼저 알아보다';
const STAGE_LABEL = '5차 방어전 · 20단계';

// 제공 CSS 는 건드리지 않고, 학생 칸의 모양은 여기서 요소별로 입힙니다(style-src 'self' 에서도 CSSOM 은 허용).
// 라이트·다크 두 벌의 색을 두고, 학생 칸 배너의 버튼으로 고릅니다. 선택값은 주소 뒤 #theme=… 에만 둡니다.
// 디자인 콘셉트: "등대"(AGENT_NAME) — 짙은 밤바다 네이비 바탕 + 등대 불빛의 호박색(beacon) 포인트.
// 상태는 색만으로 구분하지 않고 항상 같은 글자(텍스트)로도 구분합니다(색은 보조).
const BEACON = '#f0a63c';
const BEACON_DARK = '#c97a12';
const SPACE = { xs: '4px', sm: '8px', md: '12px', lg: '20px', xl: '28px' };
const RADIUS = { card: '14px', pill: '999px', control: '10px' };
const SHADOW = { light: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 20px -12px rgba(15, 23, 42, 0.18)', dark: '0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 24px -12px rgba(0, 0, 0, 0.55)' };
const PALETTES = {
  light: {
    text: '#141c2b', muted: '#5b6678', cardBg: '#ffffff', cardLine: '#dde3ee',
    bannerBg: 'linear-gradient(135deg, #10203f 0%, #1c3764 60%, #2a4a85 100%)', bannerText: '#f4f7fd',
    accent: BEACON_DARK, shadow: SHADOW.light, pageFaint: '#eef2f8',
    tones: {
      ok: { background: '#e2f8e9', color: '#15803d', border: '1px solid #6ad68f' },
      warn: { background: '#fff1cf', color: '#b45309', border: '1px solid #f3b53c' },
      bad: { background: '#fde2e1', color: '#c0291a', border: '1px solid #ef8c7e' },
      info: { background: '#e2ecff', color: '#1d4ed8', border: '1px solid #8facf7' },
      neutral: { background: '#eef1f6', color: '#333d4b', border: '1px solid #ccd3dd' },
    },
  },
  dark: {
    text: '#eef3fb', muted: '#9aacc4', cardBg: '#111c30', cardLine: '#273a57',
    bannerBg: 'linear-gradient(135deg, #060b16 0%, #0e1b33 55%, #16294a 100%)', bannerText: '#f4f7fd',
    accent: BEACON, shadow: SHADOW.dark, pageFaint: '#0b1322',
    // 보안 SIEM형 대시보드 느낌의 선명한 색(채도 높은 빨강·주황·노랑초록·파랑)을 참고했습니다. 화면을 그대로 베끼지 않고 색감만 가져왔습니다.
    tones: {
      ok: { background: '#0b2f1e', color: '#22c55e', border: '1px solid #1f8a4c' },
      warn: { background: '#3a2206', color: '#f59e0b', border: '1px solid #c2860f' },
      bad: { background: '#3a1012', color: '#ef4444', border: '1px solid #c23c3c' },
      info: { background: '#0f2347', color: '#3b82f6', border: '1px solid #3f66b0' },
      neutral: { background: '#1c2535', color: '#94a3b8', border: '1px solid #44536b' },
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
let studentApi = null; // createStudentView 가 앱의 studentApi(get 전용)를 받아 채웁니다.
const palette = () => PALETTES[theme];

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  try {
    if (globalThis.history && globalThis.location) {
      globalThis.history.replaceState(null, '', `${globalThis.location.pathname}${globalThis.location.search}#theme=${theme}`);
    }
  } catch { /* 주소를 바꾸지 못해도 이번 화면에서는 바뀝니다. */ }
  // 자료는 그대로이고 색만 바뀌는 다시 그리기이므로 15단계 기록의 걸러 보기·상세 선택은 유지합니다(redraw 는 동기 호출입니다).
  keepEventsViewOnce = true;
  try { redraw(); } finally { keepEventsViewOnce = false; }
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
  return paint(node('p', text, 'muted'), {
    color: palette().muted, lineHeight: '1.6', fontSize: '0.88rem', margin: `${SPACE.xs} 0 0`,
  });
}

// 색은 보조일 뿐이고, 상태는 항상 글자로도 적습니다.
function badge(text, tone, big = false) {
  return paint(node('span', text), {
    ...palette().tones[tone],
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: big ? '7px 16px' : '3px 11px',
    borderRadius: RADIUS.pill,
    fontWeight: '700',
    fontSize: big ? '1.1rem' : '0.86rem',
    letterSpacing: '0.01em',
    lineHeight: '1.5',
  });
}

function box(text, tone, className) {
  const p = palette();
  return paint(node('p', text, className), {
    ...p.tones[tone],
    padding: `${SPACE.sm} ${SPACE.md}`,
    borderRadius: RADIUS.control,
    margin: `${SPACE.xs} 0`,
    fontWeight: '600',
    fontSize: '0.95rem',
    lineHeight: '1.55',
    borderLeftWidth: '4px',
  });
}

function card() {
  const p = palette();
  return paint(node('section'), {
    padding: `${SPACE.lg} ${SPACE.lg}`,
    margin: `${SPACE.md} 0`,
    border: `1px solid ${p.cardLine}`,
    borderRadius: RADIUS.card,
    background: p.cardBg,
    color: p.text,
    boxShadow: p.shadow,
  });
}

// 카드 제목 앞에 등대 불빛 느낌의 작은 포인트 막대를 둡니다(장식용, 글자 내용은 그대로).
function cardTitle(text) {
  const wrap = paint(node('h3'), {
    margin: `0 0 ${SPACE.md}`,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '1.02rem',
    fontWeight: '800',
    letterSpacing: '-0.01em',
    color: palette().text,
  });
  const mark = paint(node('span'), {
    display: 'inline-block',
    width: '4px',
    height: '1.05em',
    borderRadius: '999px',
    background: palette().accent,
    flexShrink: '0',
  });
  mark.setAttribute('aria-hidden', 'true');
  wrap.append(mark, node('span', text));
  return wrap;
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

// 등대 불빛 아이콘(순수 장식, aria-hidden). createElementNS 로 SVG DOM 을 직접 구성합니다(문자열 삽입 없음).
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function buildBeaconIcon(color) {
  const svg = svgEl('svg', { viewBox: '0 0 48 48', width: '34', height: '34', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('path', { d: 'M22 6h4l3 6h-10z', fill: color }), // 꼭대기 등
    svgEl('rect', { x: 19, y: 14, width: 10, height: 20, rx: 2, fill: 'none', stroke: color, 'stroke-width': 2 }),
    svgEl('path', { d: 'M15 40h18l-3-6H18z', fill: color }), // 받침
    svgEl('line', { x1: 29, y1: 16, x2: 44, y2: 10, stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: '0.85' }),
    svgEl('line', { x1: 29, y1: 21, x2: 45, y2: 20, stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: '0.6' }),
    svgEl('line', { x1: 29, y1: 26, x2: 44, y2: 30, stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: '0.4' }),
  );
  return svg;
}

// 배너: 현재 차수·단계, 보안 Agent 이름, 라이트·다크 선택 버튼. "등대" 콘셉트의 장식(아이콘·빛번짐)만 더했고 글자는 그대로입니다.
function stageBanner() {
  const p = palette();
  const banner = paint(node('div'), {
    position: 'relative',
    overflow: 'hidden',
    background: p.bannerBg,
    color: p.bannerText,
    padding: `${SPACE.lg} ${SPACE.xl}`,
    borderRadius: RADIUS.card,
    lineHeight: '1.5',
    display: 'flex',
    gap: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    border: `1px solid ${p.cardLine}`,
    boxShadow: p.shadow,
  });
  // 오른쪽 위에서 번지는 등대 불빛(장식, 글자 없음).
  const glow = paint(node('div'), {
    position: 'absolute', inset: '0', pointerEvents: 'none',
    background: `radial-gradient(420px circle at 88% -10%, ${p.accent}33, transparent 60%)`,
  });
  glow.setAttribute('aria-hidden', 'true');

  const identity = paint(node('div'), { display: 'flex', alignItems: 'center', gap: SPACE.md, position: 'relative' });
  const iconWrap = paint(node('div'), {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '48px', height: '48px', borderRadius: RADIUS.control, flexShrink: '0',
    background: 'rgba(255, 255, 255, 0.08)', border: `1px solid ${p.accent}55`,
  });
  iconWrap.append(buildBeaconIcon(p.accent));
  const titles = node('div');
  titles.append(
    paint(node('div', STAGE_LABEL), { fontSize: '0.82rem', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase', color: p.accent }),
    paint(node('div', AGENT_NAME), { fontSize: '1.28rem', fontWeight: '800', letterSpacing: '-0.01em', marginTop: '2px' }),
  );
  identity.append(iconWrap, titles);

  const toggle = paint(node('button', theme === 'dark' ? '라이트 모드로 보기' : '다크 모드로 보기'), {
    position: 'relative',
    background: 'rgba(255, 255, 255, 0.06)',
    color: p.bannerText,
    border: `1px solid ${p.accent}66`,
    borderRadius: RADIUS.control,
    padding: '8px 16px',
    fontWeight: '700',
    fontSize: '0.9rem',
    cursor: 'pointer',
  });
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  toggle.addEventListener('click', toggleTheme);
  banner.append(glow, identity, toggle);
  return banner;
}

// 넓은 화면에서는 카드가 옆으로 나란히, 좁은 화면에서는 세로로 쌓이는 반응형 그리드(순전히 레이아웃, 글자 내용은 그대로).
function gridRow() {
  return paint(node('div'), {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: SPACE.md,
    alignItems: 'start',
  });
}

function renderIdentity(input) {
  const { me, devices, sessions } = isRecord(input) ? input : {};
  const root = node('section', undefined, 'student-identity');
  root.setAttribute('aria-label', '로그인 사용자·기기·세션');
  const grid = gridRow();
  grid.append(
    drawResource('현재 로그인', me, drawMe),
    drawResource('내 기기 목록', devices, drawDevices),
    drawResource('세션 목록', sessions, drawSessions),
  );
  root.append(stageBanner(), grid);
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
const SAFE_ACTION_ID = /^[A-Za-z0-9_.:-]{1,64}$/u;

// 걸러 보기·상세 선택은 같은 자료가 다시 그려질 때만 유지하고, 불러오는 중·실패에서는 지웁니다.
let eventsView = { kind: 'all', appId: 'all', access: 'all', selectedId: null };
const resetEventsView = () => { eventsView = { kind: 'all', appId: 'all', access: 'all', selectedId: null }; };
// 학생 화면의 테마 전환이 일으킨 다시 그리기 한 번만 true 입니다. 새 자료가 오는 경우와 구분하는 표식입니다.
let keepEventsViewOnce = false;

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
  const p = palette();
  const button = paint(node('button', text), {
    background: 'transparent',
    color: p.accent,
    border: `1.5px solid ${p.accent}`,
    borderRadius: RADIUS.control,
    padding: '5px 12px',
    fontWeight: '700',
    fontSize: '0.88rem',
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
    marginTop: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.control,
    border: `1px solid ${palette().cardLine}`,
    background: palette().cardBg,
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
  // 16단계: 자동 확인이 연결되지 않은 조치가 넘어온 경우에만 요청을 보내지 않는 비활성 안내 버튼을 둡니다.
  // supportedActions 가 비어 있으면(현재 실제 목록) 버튼도 안내도 만들지 않습니다.
  const actions = Array.isArray(event.supportedActions) ? event.supportedActions.filter((a) => typeof a === 'string' && SAFE_ACTION_ID.test(a)) : [];
  if (actions.length > 0) {
    const block = paint(node('div'), { marginTop: '8px' });
    block.append(paint(node('strong', '조치'), { color: palette().text }));
    const row = paint(node('div'), { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '6px 0' });
    for (const action of actions) {
      const button = paint(node('button', `${action} 미지원`), {
        background: 'transparent',
        color: palette().muted,
        border: `1px dashed ${palette().cardLine}`,
        borderRadius: '8px',
        padding: '4px 10px',
        fontWeight: '700',
        cursor: 'not-allowed',
      });
      button.type = 'button';
      button.disabled = true; // 눌러도 아무 요청이 나가지 않습니다(이벤트 처리기도 달지 않습니다).
      row.append(button);
    }
    block.append(row, mutedNote('조치 실행 연결은 준비 중입니다. 아직 지원하지 않는 조치이며, 이 화면은 어떤 요청도 보내지 않습니다.'));
    detail.append(block);
  }
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
    margin: `${SPACE.sm} 0`,
    padding: SPACE.md,
    border: `1px solid ${palette().cardLine}`,
    borderRadius: RADIUS.control,
    background: palette().pageFaint,
    color: palette().text,
  });
  row.dataset.studentEventId = id;
  const head = paint(node('div'), { display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: '2px' });
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
  // 새 자료(다시 불러오기 결과·불러오는 중·실패)가 오면 이전 걸러 보기와 상세 선택을 항상 지웁니다.
  // 같은 사건 ID 가 다시 와도 이전 상세는 자동으로 열리지 않습니다. 테마 전환처럼 자료는 그대로인 다시 그리기만 선택을 유지합니다.
  const sameDataRedraw = keepEventsViewOnce;
  keepEventsViewOnce = false;
  if (!sameDataRedraw) resetEventsView();
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

// ---- 16단계: 알림·기기·세션·오류·빈 화면·진단 정보 ----
// 이 칸은 아무 요청도 보내지 않습니다. 다시 시도는 사용자가 제공 화면의 「다시 불러오기」를 직접 누릅니다(자동 재요청 없음).
const RESOURCE_LABELS = {
  me: '로그인 정보', devices: '기기 목록', sessions: '세션', events: '보안 기록', apps: '업무 앱', access: '접속 판정', diagnostics: '연결 점검',
};
const TIMEOUT_CODES = new Set(['TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'WB_CLCO_TIMEOUT']);
const RETRY_GUIDE = '다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요. 이 화면은 자동으로 다시 요청하지 않으며, 성공하면 이 실패 안내는 사라집니다.';
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/u;
// 화면과 복사 내용에 비밀값처럼 보이는 문자열이 섞이지 않게 가립니다(키·토큰·비밀번호·개인키).
const SECRET_LIKE = /(?:Bearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|passwd|secret|token|비밀번호|토큰)\s*[:=]\s*\S+)/giu;

function safeText(value, max = 200) {
  return asText(value).replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(SECRET_LIKE, '[가림]').slice(0, max);
}
const safeCode = (value) => (SAFE_CODE.test(asText(value)) ? asText(value) : '(표시할 수 없는 코드)');

// 진단 결과에서 화면과 복사에 쓰는 값은 이 여섯 개뿐입니다. 그 밖의 필드(ai 설정 등)는 읽지도 않습니다.
function pickDiagnostics(data) {
  if (!isRecord(data)) return null;
  const engine = isRecord(data.engine) ? data.engine : {};
  return [
    ['requestId', safeText(data.requestId, 80)],
    ['component', safeText(data.component, 80)],
    ['version', safeText(data.version, 40)],
    ['checkedAt', safeText(data.checkedAt, 40)],
    ['engine.mode', safeText(engine.mode, 40)],
    ['engine.code', safeText(engine.code, 80)],
  ].map(([name, value]) => [name, value || '확인 불가']);
}

function failureBlock(what, resource) {
  const code = asText(isRecord(resource.error) ? resource.error.code : '');
  const message = safeText(isRecord(resource.error) ? resource.error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
  const prefix = TIMEOUT_CODES.has(code) ? '시간 초과: ' : '';
  const block = node('div');
  block.append(
    box(`${what} 불러오기에 실패했습니다: ${prefix}${message}`, 'bad', 'state state-error'),
    mutedNote(RETRY_GUIDE),
  );
  return block;
}

// 기기·세션: 불러오는 중 / 빈 목록 / 실패 / 목록을 서로 다른 문장과 모양으로 보여 줍니다.
function statusList({ title, what, resource, emptyText, scopeNote, describe }) {
  const section = card();
  section.append(cardTitle(title));
  const res = isRecord(resource) ? resource : {};
  const note = modeNote(res.mode);
  if (note) section.append(note);
  if (res.status === 'loading') {
    section.append(box(`${what} 불러오는 중…`, 'info', 'state state-loading'));
  } else if (res.status === 'error') {
    section.append(failureBlock(what, res));
  } else if (res.status === 'ok' && Array.isArray(res.data)) {
    if (res.data.length === 0) {
      section.append(box(emptyText, 'neutral', 'state state-empty'), mutedNote('불러오기는 성공했고 목록이 비어 있습니다. 실패가 아닙니다.'));
    } else {
      const list = paint(node('ul'), { margin: '0', padding: '0', listStyle: 'none' });
      for (const item of res.data) {
        const entry = paint(node('li'), { display: 'block', padding: '6px 0', color: palette().text });
        if (isRecord(item)) describe(entry, item); else entry.textContent = '확인 불가: 항목 형식이 맞지 않습니다.';
        list.append(entry);
      }
      section.append(list);
    }
  } else if (res.status === 'ok') {
    section.append(box(`확인 불가: ${what} 응답 형식이 맞지 않습니다.`, 'bad', 'state state-error'));
  } else {
    section.append(box(`확인 불가: ${what} 상태를 받지 못했습니다.`, 'bad', 'state state-error'));
  }
  if (scopeNote) section.append(mutedNote(scopeNote));
  return section;
}

function notificationsBlock(notifications) {
  const section = card();
  section.append(cardTitle('알림'));
  if (!Array.isArray(notifications)) {
    section.append(box('확인 불가: 알림 목록을 받지 못했습니다.', 'bad', 'state state-error'));
    return section;
  }
  if (notifications.length === 0) {
    section.append(box('주의할 알림이 없습니다.', 'ok', 'state state-empty'));
    return section;
  }
  const list = paint(node('ul'), { margin: '0', padding: '0', listStyle: 'none' });
  for (const item of notifications) {
    const entry = paint(node('li'), { display: 'block', padding: '6px 0', color: palette().text });
    if (!isRecord(item)) {
      entry.textContent = '확인 불가: 알림 항목 형식이 맞지 않습니다.';
    } else {
      const resource = asText(item.resource);
      const label = Object.hasOwn(RESOURCE_LABELS, resource) ? `${RESOURCE_LABELS[resource]} (${resource})` : safeCode(resource);
      entry.append(joined([`자료: ${label}`, `코드: ${safeCode(item.code)}`, safeText(item.message) || '메시지 없음']));
    }
    list.append(entry);
  }
  section.append(list);
  return section;
}

function diagnosticsBlock(diagnostics) {
  const section = card();
  section.append(cardTitle('연결 점검(진단) 정보'));
  const res = isRecord(diagnostics) ? diagnostics : {};
  const note = modeNote(res.mode);
  if (note) section.append(note);
  const picked = res.status === 'ok' ? pickDiagnostics(res.data) : null;
  if (res.status === 'loading') {
    section.append(box('연결 점검 정보를 불러오는 중…', 'info', 'state state-loading'));
  } else if (res.status === 'error') {
    section.append(failureBlock('연결 점검 정보', res));
  } else if (picked) {
    const list = node('dl', undefined, 'kv');
    for (const [name, value] of picked) addRow(list, name, value);
    section.append(list, mutedNote('위 여섯 값만 표시합니다. 키·토큰·비밀번호는 화면과 복사 내용에 넣지 않습니다.'));
  } else if (res.status === 'idle') {
    section.append(box('연결 점검 정보를 아직 불러오지 않았습니다. 위쪽 제공 화면의 「도움정보 불러오기」를 누르면 여기에 표시됩니다.', 'neutral', 'state state-empty'));
  } else {
    section.append(box('확인 불가: 연결 점검 정보를 받지 못했거나 형식이 맞지 않습니다.', 'bad', 'state state-error'));
  }
  return { section, picked, status: asText(res.status) || 'unknown' };
}

// 사용자가 버튼을 누를 때만 복사합니다. 복사하는 값은 위 진단 여섯 값과 연결 모드뿐입니다.
function helpBlock(diag, mode) {
  const lines = [`단계: ${STAGE_LABEL}`, `연결 모드: ${Object.hasOwn(MODE_LABELS, mode) || mode === 'connected' ? mode : 'unknown'}`];
  if (diag.picked) diag.picked.forEach(([name, value]) => lines.push(`${name}: ${value}`));
  else lines.push(`진단 정보: 확인 불가 (${safeCode(diag.status)})`);
  const text = lines.join('\n');
  const block = card();
  block.append(cardTitle('도움 요청용 정보'));
  block.append(mutedNote('아래 버튼을 누르면 위의 안전한 값만 복사합니다. 누르기 전에는 복사하지 않습니다. 비밀번호·토큰·API 키는 포함되지 않습니다.'));
  const result = paint(node('p', undefined, 'muted'), { margin: '8px 0 0', fontWeight: '600', color: palette().text });
  result.setAttribute('role', 'status');
  const preview = paint(node('pre'), {
    display: 'none',
    margin: '8px 0 0',
    padding: '8px 10px',
    whiteSpace: 'pre-wrap',
    borderRadius: '8px',
    border: `1px solid ${palette().cardLine}`,
    color: palette().text,
  });
  const button = accessibleButton('도움정보 복사', async () => {
    let copied = false;
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(text);
        copied = true;
      }
    } catch { /* 복사 권한이 없으면 아래 안내로 직접 복사하게 합니다. */ }
    result.textContent = copied
      ? '도움 정보를 클립보드에 복사했습니다. 붙여 넣기 전에 아래 내용에 비밀값이 없는지 확인하세요.'
      : '자동 복사에 실패했습니다. 아래 내용을 직접 선택해 복사하세요.';
    preview.textContent = text;
    preview.style.display = 'block';
  });
  block.append(button, result, preview);
  return block;
}

// 자료 하나(me·devices·sessions 같은 {status,data} 모양)를 "N건" 요약과 심각도로 줄입니다. 지어내지 않고, 상태를 못 받으면 확인 불가로 남깁니다.
function summarizeResource(resource, { badCodes = new Set(), labels = {} } = {}) {
  const res = isRecord(resource) ? resource : {};
  if (res.status === 'loading') return { text: '조회 중', tone: 'info' };
  if (res.status === 'error') return { text: '확인 불가', tone: 'bad' };
  if (res.status === 'ok' && Array.isArray(res.data)) {
    const count = res.data.length;
    const bad = res.data.filter(isRecord).some((row) => badCodes.has(asText(row.status)));
    return { text: `${count}건`, tone: count === 0 ? 'neutral' : bad ? 'warn' : 'ok' };
  }
  return { text: '확인 불가', tone: 'bad' };
}

// 숫자 하나 + 뜻을 함께 보여 주는 타일(색은 보조, 글자로도 항상 구분). "관제 대시보드" 한 줄 요약 영역.
function summaryTile(label, { text, tone }) {
  const p = palette();
  const tile = paint(node('div'), {
    flex: '1 1 150px',
    minWidth: '150px',
    padding: SPACE.md,
    borderRadius: RADIUS.control,
    border: `1px solid ${p.tones[tone].border.replace('1px solid ', '')}`,
    background: p.tones[tone].background,
  });
  tile.append(
    paint(node('div', label), { fontSize: '0.8rem', fontWeight: '700', color: p.tones[tone].color, opacity: '0.85' }),
    paint(node('div', text), { fontSize: '1.5rem', fontWeight: '800', color: p.tones[tone].color, marginTop: '2px' }),
  );
  return tile;
}

function summaryRow(devices, sessions, notifications, diagStatus) {
  const row = paint(node('div'), { display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', margin: `0 0 ${SPACE.md}` });
  const notifCount = Array.isArray(notifications) ? notifications.length : null;
  const diagMap = { ok: { text: '확인됨', tone: 'ok' }, idle: { text: '미조회', tone: 'neutral' }, loading: { text: '조회 중', tone: 'info' }, error: { text: '확인 불가', tone: 'bad' } };
  row.append(
    summaryTile('등록 기기', summarizeResource(devices, { badCodes: BAD_STATES })),
    summaryTile('현재 세션', summarizeResource(sessions, { badCodes: BAD_STATES })),
    summaryTile('알림', notifCount === null ? { text: '확인 불가', tone: 'bad' } : { text: `${notifCount}건`, tone: notifCount > 0 ? 'warn' : 'ok' }),
    summaryTile('연결 점검', diagMap[diagStatus] ?? diagMap.error),
  );
  return row;
}

// 상태 하나(정상 / 주의·확인 불가 / 취약)로 나눕니다. 정상이 아니면 전부 "확인이 필요"로 셉니다(지어내지 않음).
function classifyState(code) {
  if (NORMAL_STATES.has(code)) return 'ok';
  if (BAD_STATES.has(code)) return 'bad';
  return 'warn';
}

// 받은 자료(devices·sessions·notifications·연결 점검)만으로 양호/주의/취약 건수와 "확인이 필요한 항목" 목록을 셉니다.
// 서버가 안 보낸 값은 만들지 않고, 조회하지 못한 자료는 점수 계산에서 뺍니다.
function overviewStats(devices, sessions, notifications, diagStatus) {
  let ok = 0, warn = 0, bad = 0, total = 0;
  const flagged = [];

  const scanResource = (resource, kindLabel, labels) => {
    const res = isRecord(resource) ? resource : {};
    if (res.status !== 'ok' || !Array.isArray(res.data)) return;
    for (const row of res.data) {
      if (!isRecord(row)) continue;
      total += 1;
      const code = asText(row.status);
      const tone = classifyState(code);
      if (tone === 'ok') ok += 1; else if (tone === 'bad') bad += 1; else warn += 1;
      if (tone !== 'ok') {
        const label = asText(row.label) || asText(row.id) || '확인 불가';
        flagged.push({ text: `${kindLabel}: ${label} — ${stateText(labels, row.status)}`, tone });
      }
    }
  };
  scanResource(devices, '기기', DEVICE_LABELS);
  scanResource(sessions, '세션', SESSION_LABELS);

  if (Array.isArray(notifications)) {
    for (const item of notifications) {
      total += 1;
      warn += 1;
      if (isRecord(item)) {
        const resource = asText(item.resource);
        const label = Object.hasOwn(RESOURCE_LABELS, resource) ? RESOURCE_LABELS[resource] : safeCode(resource);
        flagged.push({ text: `알림: ${label} — ${safeText(item.message, 80) || safeCode(item.code)}`, tone: 'warn' });
      }
    }
  }

  total += 1;
  if (diagStatus === 'ok') ok += 1;
  else if (diagStatus === 'error') { bad += 1; flagged.push({ text: '연결 점검: 확인 불가', tone: 'bad' }); }
  else warn += 1;

  const score = total > 0 ? Math.round((ok / total) * 100) : null;
  return { ok, warn, bad, total, score, flagged };
}

// 양호 비율을 원형 게이지로(장식, aria-hidden). 가운데 숫자는 별도 텍스트 노드로 둡니다.
function buildGaugeSvg(score, color) {
  const size = 104, strokeWidth = 11, r = (size - strokeWidth) / 2, c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: '104', height: '104', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: palette().cardLine, 'stroke-width': strokeWidth }),
    svgEl('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': strokeWidth,
      'stroke-linecap': 'round', 'stroke-dasharray': `${c}`, 'stroke-dashoffset': `${c * (1 - pct / 100)}`,
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    }),
  );
  return svg;
}

// 종합 상태 개요 카드: 게이지 + 분포 + "지금 확인할 항목". 모두 devices·sessions·notifications·연결 점검에서만 셉니다.
const FLAGGED_LIST_LIMIT = 6;

function overviewPanel(devices, sessions, notifications, diagStatus) {
  const p = palette();
  const stats = overviewStats(devices, sessions, notifications, diagStatus);
  const section = card();
  section.append(cardTitle('종합 상태 개요'));
  section.append(mutedNote('지금 화면에 받은 기기·세션·알림·연결 점검 결과만으로 센 숫자입니다. 다른 자료는 포함하지 않습니다.'));

  const top = paint(node('div'), { display: 'flex', gap: SPACE.lg, flexWrap: 'wrap', alignItems: 'center', margin: `${SPACE.md} 0` });

  const gaugeTone = stats.score == null ? 'neutral' : stats.score >= 80 ? 'ok' : stats.score >= 50 ? 'warn' : 'bad';
  const gaugeColor = p.tones[gaugeTone].color;
  const gaugeWrap = paint(node('div'), { position: 'relative', width: '104px', height: '104px', flexShrink: '0' });
  const gaugeLabel = paint(node('div', stats.score == null ? '확인 불가' : `${stats.score}%`), {
    position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: stats.score == null ? '0.92rem' : '1.3rem', fontWeight: '800', color: p.text,
  });
  gaugeWrap.append(buildGaugeSvg(stats.score, gaugeColor), gaugeLabel);

  const counts = paint(node('div'), { display: 'flex', flexDirection: 'column', gap: '6px' });
  counts.append(
    paint(node('div', `점검 ${stats.total}건 중 양호 ${stats.ok}건`), { fontWeight: '700', color: p.text }),
    paint(node('div'), { display: 'flex', gap: '6px', flexWrap: 'wrap' }),
  );
  const badgeRow = counts.lastChild;
  badgeRow.append(
    badge(`양호 ${stats.ok}`, 'ok'),
    badge(`주의 ${stats.warn}`, 'warn'),
    badge(`취약 ${stats.bad}`, 'bad'),
  );

  top.append(gaugeWrap, counts);
  section.append(top);

  const flaggedBlock = node('div');
  flaggedBlock.append(paint(node('strong', '지금 확인할 항목'), { color: p.text }));
  if (stats.flagged.length === 0) {
    flaggedBlock.append(mutedNote('확인이 필요한 항목이 없습니다.'));
  } else {
    const list = paint(node('ul', undefined, 'plain-list'), { margin: '6px 0 0', paddingLeft: '18px', color: p.text, lineHeight: '1.8' });
    for (const item of stats.flagged.slice(0, FLAGGED_LIST_LIMIT)) {
      const li = paint(node('li'), { color: p.text });
      li.append(badge(item.tone === 'bad' ? '취약' : '주의', item.tone), ` ${item.text}`);
      list.append(li);
    }
    flaggedBlock.append(list);
    if (stats.flagged.length > FLAGGED_LIST_LIMIT) {
      flaggedBlock.append(mutedNote(`이 외 ${stats.flagged.length - FLAGGED_LIST_LIMIT}건 더 있습니다. 아래 목록에서 전체를 볼 수 있습니다.`));
    }
  }
  section.append(flaggedBlock);
  return section;
}

// ---- 6차 총공세 2일차: 내 PC 점검(student/extension.mjs + /api/pc/status) ----
// 서버가 이미 가진 읽기 전용 조회를 학생 화면에서도 부릅니다. 자동으로 반복 조회하지 않고, 버튼을 누를 때만 조회합니다.
// 값을 받지 못한 항목은 "확인 불가"와 이유로 남기고, 예시 값으로 메우지 않습니다.
const PC_STATUS_PATH = '/api/pc/status';
const PC_REASON_LABELS = {
  invalid_sample: '표본 오류', invalid_response: '응답 형식 오류', query_failed: '조회 실패',
  permission_denied: '권한 부족', unsupported: '이 환경에서 미지원', cancelled: '취소됨', timeout: '시간 초과',
};
const PC_CORE_METRICS = ['cpu', 'memory', 'disk', 'firewall', 'events']; // 네트워크는 이 다섯 개와 따로 셉니다(제공 카드가 별도 표시).
const PC_STALE_MS = 60_000; // 60초보다 오래된 측정값은 "오래됨"으로 표시합니다.
const PC_HISTORY_LIMIT = 10;

let pcStatus = { status: 'idle' }; // 'idle' | 'loading' | 'ok' | 'error'
let pcHistory = []; // 최근 조회에서 읽은 cpu·memory·disk 비율만 모읍니다(추이 비교용, 서버에 다시 묻지 않음).

const pcReasonText = (reason) => `${Object.hasOwn(PC_REASON_LABELS, reason) ? PC_REASON_LABELS[reason] : '확인 불가'} (${asText(reason) || 'unknown'})`;

function bytesToGiB(bytes) {
  return `${(bytes / (1024 ** 3)).toFixed(1)}GiB`;
}

// 조회 성공·권한 부족·부분 결과(실패)를 모두 글자로 구분합니다. 색은 보조입니다.
function pcMetricRow(list, label, metric) {
  if (!isRecord(metric)) { addRow(list, label, badge('확인 불가 (invalid_response)', 'bad')); return; }
  if (metric.state === 'ok') {
    addRow(list, label, badge('조회 성공', 'ok'));
  } else {
    const tone = metric.reason === 'permission_denied' ? 'warn' : 'bad';
    addRow(list, label, badge(pcReasonText(metric.reason), tone));
  }
}

function pcMetricDetail(data) {
  const m = isRecord(data.metrics) ? data.metrics : {};
  const list = node('dl', undefined, 'kv');
  pcMetricRow(list, 'CPU', m.cpu);
  if (isRecord(m.cpu) && m.cpu.state === 'ok') addRow(list, 'CPU 사용률', `${m.cpu.usagePercent}% (표본 ${m.cpu.sampleMs}ms)`);
  pcMetricRow(list, '메모리', m.memory);
  if (isRecord(m.memory) && m.memory.state === 'ok') addRow(list, '메모리 사용량', `${bytesToGiB(m.memory.usedBytes)} / ${bytesToGiB(m.memory.totalBytes)}`);
  pcMetricRow(list, '디스크', m.disk);
  if (isRecord(m.disk) && m.disk.state === 'ok') addRow(list, '디스크 남은 공간', `${bytesToGiB(m.disk.freeBytes)} / ${bytesToGiB(m.disk.totalBytes)}`);
  pcMetricRow(list, 'Windows 방화벽', m.firewall);
  if (isRecord(m.firewall) && m.firewall.state === 'ok' && Array.isArray(m.firewall.profiles)) {
    addRow(list, '방화벽 프로필', m.firewall.profiles.map((p) => `${p.name} ${p.enabled ? '켜짐' : '꺼짐'}`).join(' · '));
  }
  pcMetricRow(list, 'Windows 기록(24시간)', m.events);
  if (isRecord(m.events) && m.events.state === 'ok') {
    addRow(list, '경고·오류 건수', `경고 ${m.events.warningCount} · 오류 ${m.events.errorCount}${m.events.truncated ? ` · 최대 ${m.events.sampleLimit}건까지만 집계(부분 결과)` : ''}`);
  }
  pcMetricRow(list, '네트워크(참고, 5개 집계 제외)', m.network);
  if (isRecord(m.network) && m.network.state === 'ok') addRow(list, '네트워크 인터페이스', `${m.network.interfaceCount}개 · IPv4 ${m.network.ipv4Count}개`);
  return list;
}

// 직전 조회와 비교해 CPU·메모리·디스크 사용 비율이 어떻게 바뀌었는지만 보여 줍니다. 새 요청을 보내지 않습니다.
function pcTrendNote() {
  if (pcHistory.length < 2) return mutedNote('비교할 이전 조회가 아직 없습니다. 한 번 더 조회하면 직전 값과 비교해 보여 줍니다.');
  const prev = pcHistory[pcHistory.length - 2];
  const last = pcHistory[pcHistory.length - 1];
  const delta = (a, b) => (a == null || b == null ? null : Math.round((b - a) * 10) / 10);
  const lines = [];
  const cpuDelta = delta(prev.cpuPercent, last.cpuPercent);
  if (cpuDelta !== null) lines.push(`CPU ${cpuDelta >= 0 ? '▲' : '▼'}${Math.abs(cpuDelta)}%p`);
  const memDelta = delta(prev.memRatio, last.memRatio);
  if (memDelta !== null) lines.push(`메모리 사용률 ${memDelta >= 0 ? '▲' : '▼'}${Math.abs(memDelta)}%p`);
  const diskDelta = delta(prev.diskFreeRatio, last.diskFreeRatio);
  if (diskDelta !== null) lines.push(`디스크 여유율 ${diskDelta >= 0 ? '▲' : '▼'}${Math.abs(diskDelta)}%p`);
  if (lines.length === 0) return mutedNote('직전 조회와 비교할 값이 없습니다(두 조회 모두 확인 불가).');
  return mutedNote(`직전 조회(${formatAt(prev.measuredAt)}) 대비: ${lines.join(' · ')}`);
}

function recordPcHistory(data) {
  const m = isRecord(data.metrics) ? data.metrics : {};
  const cpuPercent = isRecord(m.cpu) && m.cpu.state === 'ok' ? m.cpu.usagePercent : null;
  const memRatio = isRecord(m.memory) && m.memory.state === 'ok' ? Math.round((m.memory.usedBytes / m.memory.totalBytes) * 1000) / 10 : null;
  const diskFreeRatio = isRecord(m.disk) && m.disk.state === 'ok' ? Math.round((m.disk.freeBytes / m.disk.totalBytes) * 1000) / 10 : null;
  pcHistory.push({ measuredAt: data.measuredAt, cpuPercent, memRatio, diskFreeRatio });
  if (pcHistory.length > PC_HISTORY_LIMIT) pcHistory.shift();
}

async function requestPcStatus() {
  if (!studentApi || pcStatus.status === 'loading') return;
  pcStatus = { status: 'loading' };
  redraw();
  let res;
  try {
    res = await studentApi.get(PC_STATUS_PATH);
  } catch {
    res = { ok: false, error: { code: 'REQUEST_FAILED', message: '요청을 보내지 못했습니다.' } };
  }
  if (res && res.ok === true && isRecord(res.data) && isRecord(res.data.metrics)) {
    pcStatus = { status: 'ok', data: res.data };
    recordPcHistory(res.data);
  } else {
    pcStatus = { status: 'error', error: isRecord(res) ? res.error : null };
  }
  redraw();
}

function pcStatusCard() {
  const p = palette();
  const section = card();
  section.append(cardTitle('내 PC 점검(학생 구현)'));
  section.append(mutedNote('CPU·메모리·디스크·Windows 방화벽·Windows 기록 다섯 항목을 버튼을 누를 때만 실제로 조회합니다. 자동으로 반복 조회하지 않고, 읽지 못한 항목은 예시 값 없이 "확인 불가"로 남깁니다.'));

  if (!studentApi) {
    section.append(box('지원 없음: 이 화면 환경에서 PC 조회 연결을 받지 못했습니다.', 'neutral', 'state state-empty'));
    return section;
  }

  const button = accessibleButton(pcStatus.status === 'loading' ? '조회 중…' : pcStatus.status === 'ok' ? '다시 조회' : '내 PC 실측 조회', requestPcStatus);
  if (pcStatus.status === 'loading') { button.disabled = true; button.setAttribute('aria-disabled', 'true'); }
  section.append(button);

  if (pcStatus.status === 'idle') {
    section.append(box('아직 조회하지 않았습니다.', 'neutral', 'state state-empty'));
  } else if (pcStatus.status === 'loading') {
    section.append(box('조회 중… (몇 초 걸릴 수 있습니다)', 'info', 'state state-loading'));
  } else if (pcStatus.status === 'error') {
    const code = safeCode(isRecord(pcStatus.error) ? pcStatus.error.code : '');
    const message = safeText(isRecord(pcStatus.error) ? pcStatus.error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    if (code === 'NOT_ALLOWED') {
      section.append(box('지원 없음: 이 시작 틀 판에서는 학생 화면의 PC 조회가 아직 허용되지 않습니다.', 'neutral', 'state state-empty'));
      section.append(mutedNote('위쪽 제공 카드 「내 PC 상태」에서 같은 값을 확인할 수 있습니다.'));
    } else {
      section.append(box(`조회 실패 (${code}): ${message}`, 'bad', 'state state-error'));
    }
  } else if (pcStatus.status === 'ok') {
    const data = pcStatus.data;
    const m = isRecord(data.metrics) ? data.metrics : {};
    const okCount = PC_CORE_METRICS.filter((key) => isRecord(m[key]) && m[key].state === 'ok').length;
    const ageMs = Date.now() - Date.parse(asText(data.measuredAt));
    const stale = Number.isFinite(ageMs) && ageMs > PC_STALE_MS;
    section.append(badge(`실측 ${okCount}/${PC_CORE_METRICS.length} · 확인 불가 ${PC_CORE_METRICS.length - okCount}개`, okCount === PC_CORE_METRICS.length ? 'ok' : okCount === 0 ? 'bad' : 'warn', true));
    if (stale) section.append(box(`오래됨: 측정 시각이 ${Math.round(ageMs / 1000)}초 전입니다. 다시 조회해야 지금 값입니다.`, 'warn', 'state'));
    section.append(mutedNote(`측정 시각: ${formatAt(data.measuredAt)}`));
    section.append(pcMetricDetail(data));
    section.append(paint(node('strong', '추이 비교'), { color: p.text, display: 'block', marginTop: SPACE.sm }));
    section.append(pcTrendNote());
  }
  section.append(mutedNote('관찰이 0건이거나 방화벽이 모두 켜져 있다는 것만으로 안전·이상 없음으로 판정하지 않습니다. CPU 값은 200ms 표본 한 번입니다.'));
  return section;
}

function renderStatus(input) {
  const { devices, sessions, notifications, diagnostics, mode } = isRecord(input) ? input : {};
  const root = node('section', undefined, 'student-status');
  root.setAttribute('aria-label', '기기·세션·알림과 연결 점검 상태');
  const note = modeNote(mode);
  const diag = diagnosticsBlock(diagnostics);
  root.append(overviewPanel(devices, sessions, notifications, diag.status));
  root.append(summaryRow(devices, sessions, notifications, diag.status));
  root.append(pcStatusCard());
  const grid = gridRow();
  grid.append(
    statusList({
      title: '등록 기기', what: '기기 목록', resource: devices, emptyText: '등록된 기기가 없습니다.',
      scopeNote: '내 이름으로 등록되고 회수되지 않은 기기이며 최대 100개까지 보입니다. 서버가 모르는 값은 확인 불가로 표시합니다.',
      describe: (entry, device) => entry.append(joined([asText(device.label) || asText(device.id) || '확인 불가', stateLine(DEVICE_LABELS, device.status), `ID ${asText(device.id)}`])),
    }),
    statusList({
      title: '현재 세션', what: '세션', resource: sessions, emptyText: '현재 연결된 세션이 없습니다.',
      scopeNote: '세션은 지금 검증된 연결 하나만 보여 줍니다. 지난 세션 전체 목록이 아닙니다.',
      describe: (entry, session) => entry.append(joined([`ID ${asText(session.id)}`, stateLine(SESSION_LABELS, session.status)])),
    }),
    notificationsBlock(notifications),
    diag.section,
    helpBlock(diag, mode),
  );
  root.append(grid);
  if (note) root.prepend(note);
  return root;
}

// ---- 17단계: 앱 내부 AI 연결 상태 ----
// 이 칸은 어떤 요청도 보내지 않고, 키·주소 입력 칸도 만들지 않습니다. 다시 점검은 사용자가 제공 화면의 버튼을 직접 누릅니다.
// 오류는 code 로 원인을 나눕니다. 권한이 준비되지 않아 생기는 실패는 학생 잘못이 아니라고 분명히 적습니다.
const AI_ERROR_KINDS = {
  ON_AI_PROVISIONING_PENDING: { kind: '권한 준비 중', guide: '학생 앱의 이용 권한을 준비하는 중입니다. 학생 잘못이 아닙니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' },
  AI_REQUEST_UNVERIFIED: { kind: '확인 불가', guide: '연결이나 응답을 확인할 수 없습니다. 성공으로 보지 마세요. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' },
  SUBJECT_SCOPE_UNVERIFIED: { kind: '확인 불가', guide: '현재 로그인과 사건·프로젝트의 연결을 확인할 수 없습니다. 계정 연결을 다시 확인하고 담당자에게 문의하세요.' },
  WB_CLCO_AUTH_REQUIRED: { kind: '인증 실패', guide: '계정 연결을 다시 확인하고 담당자에게 확인하세요. 키를 복사해 붙이지 마세요.' },
  WB_CLCO_ACCESS_BLOCKED: { kind: '접근 제한', guide: '학생 앱의 이용 권한이 제한돼 있습니다. 계정 연결을 다시 확인하고 담당자에게 확인하세요.' },
  WB_CLCO_COHORT_BUDGET_EXHAUSTED: { kind: '반 사용량 소진', guide: '반 전체의 AI 사용량이 소진됐습니다. 담당자에게 확인하세요.' },
  WB_CLCO_LIMIT_REACHED: { kind: '이용 한도 도달', guide: 'AI 이용 한도에 도달했습니다. 담당자에게 확인하세요.' },
  WB_CLCO_SESSION_CLOSED: { kind: '이용 시간 아님', guide: '지금은 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.' },
  WB_CLCO_RATE_LIMITED: { kind: '요청 제한', guide: 'AI 요청이 잠시 제한됐습니다. 잠시 뒤 직접 다시 점검하세요.' },
  WB_CLCO_TIMEOUT: { kind: '시간 초과', guide: 'AI 응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 점검하세요.' },
  REQUEST_TIMEOUT: { kind: '시간 초과', guide: '서버의 AI 응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 점검하세요.' },
  ENGINE_TIMEOUT: { kind: '시간 초과', guide: '서버의 확인 시간이 초과됐습니다. 잠시 뒤 직접 다시 점검하세요.' },
  TIMEOUT: { kind: '시간 초과', guide: 'AI 응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 점검하세요.' },
  NETWORK_ERROR: { kind: '네트워크 오류', guide: '앱 서버에 연결하지 못했습니다. 잠시 뒤 직접 다시 점검하세요.' },
  WB_CLCO_CANCELLED: { kind: '취소됨', guide: '점검을 취소했습니다. 이전 응답은 현재 결과가 아닙니다.' },
  CANCELLED: { kind: '취소됨', guide: '점검을 취소했습니다. 이전 응답은 현재 결과가 아닙니다.' },
  REQUEST_CANCELLED: { kind: '취소됨', guide: '점검을 취소했습니다. 이전 응답은 현재 결과가 아닙니다.' },
  ON_AI_MODEL_LIST_EMPTY: { kind: '쓸 수 있는 모델 없음', guide: '현재 앱 권한으로 쓸 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.' },
  MODEL_NOT_CONFIGURED: { kind: '쓸 수 있는 모델 없음', guide: '서버에 사용할 모델이 설정돼 있지 않습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.' },
  ON_AI_AUTHORIZATION_CHANGED: { kind: '권한 변경', guide: '점검 도중 이용 권한 내용이 바뀌었습니다. 다시 점검하기 전에 담당자에게 현재 권한을 확인하세요.' },
};
const AI_CHECK_LABELS = { test: '시험 연결 점검(test)', verified: '앱 권한 확인 후 점검(verified)' };
const AI_ROLES_NOTE = '역할 구분: 워크벤치 수업용 AI는 코드를 함께 쓰는 학습 도구이고, 앱 안의 AI 설명 기능은 보안 사건을 설명하고 조치를 제안하며, ALEPH의 공식 과제 판정 AI는 제출한 코드를 읽고 단계를 판정합니다. 서로 다른 역할입니다.';

function aiRecheckGuide() {
  return mutedNote('다시 점검은 위쪽 「현재 API 연결 점검」 버튼을 직접 눌러야 합니다. 이 화면은 자동으로 다시 점검하지 않으며, 성공하면 이전 오류 안내는 사라집니다.');
}

function renderAiConnection(input) {
  const { status, mode, data, error, checkedAt, explanationAccepted } = isRecord(input) ? input : {};
  const root = card();
  root.className = 'student-ai-connection';
  root.setAttribute('aria-label', '앱 내부 AI 연결 점검 상태');
  root.append(cardTitle('앱 내부 AI 연결 점검'));
  const note = modeNote(mode);
  if (note) root.append(note);
  if (status === 'idle') {
    // 계정 연결을 다시 하는 등으로 idle 이 오면 이전 점검 결과는 남기지 않고 점검 전으로 돌아갑니다.
    root.append(box('AI 연결 점검 전', 'neutral', 'state state-empty'));
    root.append(mutedNote('아직 점검하지 않았습니다. 설정값이 있다는 것은 이용 권한 확인이 아닙니다. 점검은 위쪽 「현재 API 연결 점검」 버튼을 직접 눌러 시작합니다.'));
  } else if (status === 'loading') {
    root.append(box('AI 연결 점검 중', 'info', 'state state-loading'));
    root.append(mutedNote('점검 중에는 제공 화면의 「AI 연결 점검 취소」로 취소할 수 있습니다. 취소하면 늦게 도착한 응답은 현재 결과로 쓰지 않습니다.'));
  } else if (status === 'error') {
    const code = safeCode(isRecord(error) ? error.code : '');
    const known = Object.hasOwn(AI_ERROR_KINDS, code) ? AI_ERROR_KINDS[code] : null;
    const message = safeText(isRecord(error) ? error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    root.append(box(`AI 연결 점검 실패 · ${known ? known.kind : '확인 불가'}`, known && known.kind === '취소됨' ? 'neutral' : 'bad', 'state state-error'));
    root.append(paint(node('p', `오류 코드: ${code}`), { margin: '6px 0', fontWeight: '700', color: palette().text }));
    root.append(paint(node('p', `안내 메시지: ${message}`), { margin: '6px 0', color: palette().text }));
    root.append(paint(node('p', known ? known.guide : '원인을 확인할 수 없습니다. 성공으로 보지 말고 담당자에게 확인을 요청하세요.'), { margin: '6px 0', fontWeight: '600', color: palette().text }));
    root.append(aiRecheckGuide());
  } else if (status === 'ok' && isRecord(data) && Object.hasOwn(AI_CHECK_LABELS, asText(data.audienceAuthorization)) && Number.isInteger(data.modelCount)) {
    const kind = asText(data.audienceAuthorization);
    root.append(box(`AI 연결 점검 완료 · ${AI_CHECK_LABELS[kind]}`, kind === 'verified' ? 'ok' : 'warn', 'state state-ok'));
    const list = node('dl', undefined, 'kv');
    addRow(list, '응답 모델 수', String(data.modelCount));
    addRow(list, '점검 시각', safeText(checkedAt, 40) || '시각 정보 없음');
    addRow(list, '사건 설명', explanationAccepted === true ? '수용됨' : '아직 실행하지 않았습니다');
    root.append(list);
    root.append(box('연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다. 모델 목록 응답은 사건 설명이 된 것이 아닙니다.', 'info', 'state'));
    if (kind === 'test') root.append(mutedNote('시험 연결 점검입니다. 실제 앱 권한을 확인한 결과가 아닙니다.'));
  } else if (status === 'ok') {
    root.append(box('확인 불가: 점검 결과의 형식이 맞지 않아 성공으로 표시하지 않습니다.', 'bad', 'state state-error'));
    root.append(aiRecheckGuide());
  } else {
    root.append(box('확인 불가: 점검 상태를 받지 못했습니다.', 'bad', 'state state-error'));
  }
  root.append(mutedNote(AI_ROLES_NOTE));
  return root;
}

// ---- 18단계: 근거에 연결된 AI 사건 설명 ----
const EXPLANATION_STATE_LABELS = { access: '접속', session: '세션', device: '기기' };

// event.state 에서 unknown 인 항목만 접속·세션·기기별로 뽑습니다. 확인 불가를 정상·안전으로 바꾸지 않습니다.
function explanationUnknownList(state) {
  const s = isRecord(state) ? state : {};
  const lines = [];
  for (const [key, label] of Object.entries(EXPLANATION_STATE_LABELS)) {
    if (asText(s[key]) === 'unknown') lines.push(`${label}: 확인 불가 (unknown)`);
  }
  return lines;
}

// evidenceIds 전부가 현재 event.evidence 안에 있을 때만 근거 글 목록을 돌려줍니다. 하나라도 없으면 null(이 설명은 쓸 수 없음).
function matchedEvidence(evidenceIds, evidence) {
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0 || !Array.isArray(evidence)) return null;
  const byId = new Map(evidence.filter(isRecord).map((item) => [asText(item.id), item]));
  const matched = [];
  for (const id of evidenceIds) {
    const found = byId.get(asText(id));
    if (!found) return null;
    matched.push({ id: asText(id), text: asText(found.text) || '내용 없음' });
  }
  return matched;
}

function explanationProposalsBlock(proposals, supportedActions) {
  const block = node('div');
  block.append(paint(node('strong', '제안'), { color: palette().text }));
  const list = Array.isArray(proposals) ? proposals.filter(isRecord) : [];
  if (list.length === 0) {
    const hasSupport = Array.isArray(supportedActions) && supportedActions.length > 0;
    block.append(mutedNote(hasSupport
      ? 'AI가 제안한 조치가 없습니다.'
      : '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'));
    return block;
  }
  const ul = paint(node('ul', undefined, 'plain-list'), { margin: '4px 0 8px', paddingLeft: '18px', color: palette().text });
  for (const proposal of list) {
    const li = paint(node('li'), { color: palette().text, margin: '4px 0' });
    li.append(
      paint(node('strong', asText(proposal.action) || '(조치 이름 없음)'), {}),
      ` — ${asText(proposal.reason) || '이유 없음'}`,
      node('br'),
      '사람 확인이 필요하며 실행되지 않았습니다.',
    );
    ul.append(li);
  }
  block.append(ul);
  return block;
}

function renderExplanation(input) {
  const { event, explanation, checkedAt } = isRecord(input) ? input : {};
  const root = card();
  root.className = 'student-explanation';
  root.setAttribute('aria-label', '선택한 사건의 AI 설명');
  root.append(cardTitle('AI 사건 설명'));
  const res = isRecord(explanation) ? explanation : {};

  // 오류는 event 유무와 상관없이 먼저 보여 줍니다. 기록은 그대로이며 과제 실패가 아닙니다.
  if (res.status === 'error') {
    const code = safeCode(isRecord(res.error) ? res.error.code : '');
    const message = safeText(isRecord(res.error) ? res.error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    root.append(box(`AI 설명 실패 (${code}): ${message}`, 'bad', 'state state-error'));
    root.append(mutedNote('기록은 그대로 유지됩니다. AI 연결이나 응답 문제는 기록을 바꾸지 않습니다. 필요하면 직접 다시 요청하세요.'));
    return root;
  }
  if (!isRecord(event)) {
    root.append(box('보안 기록에서 기록을 먼저 고르세요.', 'neutral', 'state state-empty'));
    return root;
  }
  if (res.status === 'loading') {
    root.append(box('AI 설명 요청 중…', 'info', 'state state-loading'));
    return root;
  }
  if (res.status !== 'ok') {
    root.append(box('아직 설명을 요청하지 않았습니다. 보안 기록에서 사건을 골라 「AI 설명 요청」을 누르세요.', 'neutral', 'state state-empty'));
    return root;
  }
  if (!isRecord(res.data)) {
    root.append(box('확인 불가: 설명 결과의 형식이 맞지 않아 표시하지 않습니다. 기록은 그대로입니다.', 'bad', 'state state-error'));
    return root;
  }
  const data = res.data;
  // 제공 코드가 이미 검사했어야 하는 값이지만, 어긋나게 들어와도 성공으로 보여주지 않습니다.
  if (data.executed === true) {
    root.append(box('확인 불가: AI가 이미 실행했다고 답한 설명은 쓸 수 없습니다.', 'bad', 'state state-error'));
    root.append(mutedNote('실행 여부는 사람이 확인합니다. 기록은 그대로입니다.'));
    return root;
  }
  const summary = safeText(data.summary, 1500);
  const matched = matchedEvidence(data.evidenceIds, event.evidence);
  if (!summary || !matched) {
    root.append(box('확인 불가: 이 설명의 근거가 현재 선택한 기록과 맞지 않아 표시하지 않습니다.', 'bad', 'state state-error'));
    root.append(mutedNote('근거 ID가 이 기록의 근거 목록에 없거나 요약이 비어 있습니다. 내용을 지어내지 않습니다.'));
    return root;
  }

  // 근거가 맞아떨어진 설명에만 표식을 붙입니다.
  root.dataset.studentExplanationEvent = asText(event.id);
  root.append(cardTitle('AI 설명(참고용)'));
  const list = node('dl', undefined, 'kv');
  addRow(list, '사건 ID', asText(event.id) || '(id 없음)');
  addRow(list, 'AI 요약', summary);
  addRow(list, '확인 시각', safeText(checkedAt, 40) || '시각 정보 없음');
  root.append(list);
  root.append(listBlock('인용한 근거', matched, (item) => `${item.id} — ${item.text}`, '근거가 없습니다.'));
  root.append(listBlock('규칙', event.rules, (item) => `${asText(item.id) || '(id 없음)'} — ${asText(item.text) || '내용 없음'}`, '규칙 정보가 없습니다.'));

  const unknowns = explanationUnknownList(event.state);
  const unknownBlock = node('div');
  unknownBlock.append(paint(node('strong', '확인 불가 상태 (unknown)'), { color: palette().text }));
  unknownBlock.append(mutedNote(unknowns.length ? unknowns.join(' · ') : '없음'));
  root.append(unknownBlock);

  root.append(explanationProposalsBlock(data.proposals, event.supportedActions));
  root.append(mutedNote('AI 설명은 참고 정보입니다. 설명·제안만으로 보안 조치가 실행되지 않습니다.'));
  return root;
}

// ---- 19단계: AI 조치 제안과 실제 처리 결과 ----
// 이 칸은 조치 버튼·POST 요청·확인 티켓을 만들지 않습니다. 집행·재조회·취소는 제공 화면 버튼으로만 합니다.
const ACTION_STATUS_VIEWS = {
  idle: { label: '아직 미실행(idle)', tone: 'neutral' },
  loading: { label: '준비 또는 결과 확인 중(loading). 아직 결과가 없습니다.', tone: 'info' },
  prepared: { label: '준비됨 · 미실행(prepared)', tone: 'warn' },
  executing: { label: '서버에 전달 중(executing)', tone: 'info' },
  pending: { label: '서버 접수 · 처리 중(pending)', tone: 'info' },
  denied: { label: '거절(denied)', tone: 'bad' },
  failed: { label: '실패(failed)', tone: 'bad' },
  expired: { label: '확인 기한 지남(expired)', tone: 'warn' },
};

// 현재 사건·근거 ID·조치·대상·접수 정보를 받은 범위에서만 글자로 보여 줍니다.
function actionFactsList(event, actionId, target, receipt) {
  const list = node('dl', undefined, 'kv');
  let any = false;
  const add = (term, value) => {
    const text = asText(value);
    if (!text) return;
    addRow(list, term, text);
    any = true;
  };
  if (isRecord(event)) {
    add('사건 ID', event.id);
    if (Array.isArray(event.evidence)) {
      const ids = event.evidence.filter(isRecord).map((item) => asText(item.id)).filter(Boolean);
      if (ids.length) { addRow(list, '근거 ID', ids.join(', ')); any = true; }
    }
  }
  add('조치', actionId);
  if (isRecord(target)) {
    add('대상 ID', target.id);
    add('대상 generation', target.generation);
  }
  if (isRecord(receipt)) {
    add('요청 ID', receipt.requestId);
    add('접수 ID', receipt.receiptId);
    add('버전', receipt.version);
  }
  return any ? list : null;
}

function renderAction(input) {
  const { status, event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = isRecord(input) ? input : {};
  const root = card();
  root.className = 'student-action';
  root.setAttribute('aria-label', '보안 조치 요청 상태');
  root.append(cardTitle('보안 조치 요청 상태'));

  // 현재 입력으로만 다시 그리므로, 다른 사건·요청이 오면 이전 표시는 자동으로 사라집니다.
  if (isRecord(event) && asText(event.id)) root.dataset.studentActionEvent = asText(event.id);
  if (isRecord(receipt) && asText(receipt.requestId)) root.dataset.studentActionRequest = asText(receipt.requestId);

  const code = asText(status);
  if (code === 'error') {
    const errCode = safeCode(isRecord(error) ? error.code : '');
    const errMessage = safeText(isRecord(error) ? error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    root.append(box(`요청이 처리되지 않았습니다(error) · ${errCode}: ${errMessage}`, 'bad', 'state state-error'));
  } else if (code === 'succeeded') {
    // 서버가 받았다는 것(ACK)이 아니라, 연동 시스템이 effectApplied:true 로 효과를 확인했을 때만 성공으로 보여 줍니다.
    if (isRecord(observation) && observation.effectApplied === true) {
      root.append(box('효과 확인(succeeded)', 'ok', 'state state-ok'));
      const obsList = node('dl', undefined, 'kv');
      addRow(obsList, '관측 시각', safeText(observation.observedAt, 40) || '시각 정보 없음');
      addRow(obsList, 'effectApplied', 'true');
      if (isRecord(receipt) && asText(receipt.receiptId)) addRow(obsList, '접수 ID', asText(receipt.receiptId));
      root.append(obsList);
    } else {
      root.append(box('결과 불명(succeeded, 효과 미확인): 연동 시스템이 효과를 확인하지 않았습니다.', 'warn', 'state state-error'));
      root.append(mutedNote('성공으로도 효과 없음으로도 판단하지 않습니다. 제공 화면의 「연동 시스템 결과만 재조회」로 다시 확인하세요.'));
    }
  } else if (code === 'unknown') {
    root.append(box('결과 불명(unknown)', 'warn', 'state state-error'));
    root.append(mutedNote('효과 없음으로도 성공으로도 단정하지 않습니다. 제공 화면의 「연동 시스템 결과만 재조회」로 결과만 다시 확인하세요.'));
  } else if (Object.hasOwn(ACTION_STATUS_VIEWS, code)) {
    const view = ACTION_STATUS_VIEWS[code];
    root.append(box(view.label, view.tone, 'state'));
    if (code === 'prepared') {
      root.append(mutedNote(`확인 기한: ${safeText(confirmationExpiresAt, 40) || '정보 없음'}. 진행하려면 제공 화면의 「대상과 조치를 확인했으며 집행합니다」를 누르세요.`));
    } else if (code === 'executing' || code === 'pending') {
      root.append(mutedNote('서버가 받았다는 것(ACK)은 효과가 아닙니다. 결과가 아직 확인되지 않았습니다.'));
    } else if (code === 'expired') {
      root.append(mutedNote('확인 기한이 지났습니다. 제공 화면에서 조치를 다시 준비하세요.'));
    } else if (code === 'denied' || code === 'failed') {
      root.append(mutedNote(safeText(message) || '연동 시스템이 이유를 알려 주지 않았습니다.'));
    }
  } else {
    root.append(box(`확인 불가: 조치 상태를 받지 못했습니다(${code || 'unknown'}).`, 'bad', 'state state-error'));
  }

  const facts = actionFactsList(event, actionId, target, receipt);
  if (facts) root.append(facts);
  root.append(mutedNote('이 화면은 조치를 실행하지 않습니다. 준비·집행·재조회·취소는 제공 화면의 버튼으로만 합니다.'));
  return root;
}

// ---- 20단계: 설치 패키지 버전과 OSV 취약점 조회 ----
const PKG_OVERALL_STATUS = {
  complete: '모두 조회(complete)',
  partial: '일부 조회 실패(partial)',
  not_checked: '아직 조회 안 함(not_checked)',
  not_configured: '조회 준비 미완료(not_configured)',
  unverifiable: 'lock 파일 확인 불가(unverifiable)',
};
const PKG_STATUS_LABELS = {
  known_vulnerabilities: '알려진 항목 있음(known_vulnerabilities)',
  none_found: '알려진 항목 없음(none_found)',
  unverifiable: '조회 확인 불가(unverifiable)',
};

function vulnerabilityList(vulnerabilities) {
  if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) return null;
  return listBlock(
    '취약점',
    vulnerabilities.filter(isRecord),
    (item) => `${asText(item.id) || '(id 없음)'} · 수정 ${safeText(item.modified, 40) || '시각 정보 없음'}`,
    '',
  );
}

function packageRow(pkg) {
  const row = card();
  row.dataset.studentPackageName = asText(pkg.name);
  row.dataset.studentPackageVersion = asText(pkg.version);
  const list = node('dl', undefined, 'kv');
  addRow(list, '패키지', asText(pkg.name) || '(이름 없음)');
  addRow(list, '설치 버전', asText(pkg.version) || '확인 불가');
  const statusCode = asText(pkg.status);
  addRow(list, '조회 상태', Object.hasOwn(PKG_STATUS_LABELS, statusCode) ? PKG_STATUS_LABELS[statusCode] : `확인 불가 (${statusCode || 'unknown'})`);
  addRow(list, '출처', asText(pkg.source) || '정보 없음');
  addRow(list, '확인 시각', safeText(pkg.checkedAt, 40) || '시각 정보 없음');
  row.append(list);
  const vulnBlock = vulnerabilityList(pkg.vulnerabilities);
  if (vulnBlock) {
    // 조회가 unverifiable 이어도 이미 받은 취약점 ID 는 지우지 않고 그대로 보여 줍니다.
    if (statusCode === 'unverifiable') row.append(mutedNote('일부 확인 · 전체 조회 확인 불가. 이미 받은 취약점 ID는 지우지 않습니다.'));
    row.append(vulnBlock);
  } else if (statusCode === 'none_found') {
    row.append(mutedNote('이 조회 범위에서 알려진 취약점이 없습니다. 안전을 보장하는 것은 아닙니다.'));
  }
  return row;
}

function renderVulnerabilities(input) {
  const { status, mode, data, error } = isRecord(input) ? input : {};
  const root = card();
  root.className = 'student-vulnerabilities';
  root.setAttribute('aria-label', '설치 패키지와 취약점 조회 결과');
  root.append(cardTitle('설치 패키지와 취약점 조회'));
  const note = modeNote(mode);
  if (note) root.append(note);

  if (status === 'idle') {
    root.append(box('조회 전', 'neutral', 'state state-empty'));
    return root;
  }
  if (status === 'loading') {
    root.append(box('조회 중', 'info', 'state state-loading'));
    root.append(mutedNote('진행 중에는 이전 결과를 현재 결과처럼 보여주지 않습니다.'));
    return root;
  }
  if (status === 'error') {
    const message = safeText(isRecord(error) ? error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    root.append(box(`조회 실패: ${message}`, 'bad', 'state state-error'));
    root.append(mutedNote('이전 조회 결과는 현재 결과가 아니므로 표시하지 않습니다.'));
    return root;
  }
  if (status !== 'ok' || !isRecord(data)) {
    root.append(box(`확인 불가: 조회 결과의 형식이 맞지 않습니다(${asText(status) || 'unknown'}).`, 'bad', 'state state-error'));
    return root;
  }

  const overallCode = asText(data.status);
  const overallTone = overallCode === 'complete' ? 'ok' : overallCode === 'partial' ? 'warn' : 'neutral';
  root.append(box(Object.hasOwn(PKG_OVERALL_STATUS, overallCode) ? PKG_OVERALL_STATUS[overallCode] : `확인 불가 (${overallCode || 'unknown'})`, overallTone, 'state'));

  const meta = node('dl', undefined, 'kv');
  addRow(meta, 'lock 파일 버전', safeText(data.lockfileVersion, 40) || '정보 없음');
  addRow(meta, 'lock 파일 해시', safeText(data.lockfileHash, 100) || '정보 없음');
  addRow(meta, '확인 시각', safeText(data.checkedAt, 40) || '시각 정보 없음');
  root.append(meta);

  const packages = Array.isArray(data.packages) ? data.packages.filter(isRecord) : [];
  if (packages.length === 0) {
    root.append(mutedNote('표시할 패키지가 없습니다. 조회 준비 미완료이거나 lock 파일을 확인할 수 없는 상태일 수 있습니다.'));
  } else {
    for (const pkg of packages) root.append(packageRow(pkg));
  }
  return root;
}

export function createStudentView(context) {
  // 앱이 주는 onChange 를 부르면 학생 표시 함수가 최신 자료로 다시 그려집니다(테마를 바꿀 때 씁니다).
  redraw = typeof context?.onChange === 'function' ? context.onChange : () => {};
  studentApi = isRecord(context?.api) && typeof context.api.get === 'function' ? context.api : null;
  return {
    renderIdentity,
    renderDecision,
    renderEvents,
    renderStatus,
    renderVulnerabilities,
    renderAiConnection,
    renderExplanation,
    renderAction,
  };
}
