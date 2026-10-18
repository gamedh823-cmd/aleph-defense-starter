// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ---- 13단계: 로그인 사용자·기기·세션 표시 ----
// 상태값은 API 계약 그대로 두고, 화면 문구만 한국어로 바꿉니다.
const DEVICE_LABELS = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_LABELS = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const MODE_LABELS = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
const NORMAL_STATES = new Set(['compliant', 'active']); // 그 밖의 값은 정상처럼 보이지 않게 합니다.

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

const asText = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 한국어 뜻과 원래 상태값을 함께 적습니다. 목록에 없는 값은 확인 불가로 읽습니다.
function stateText(labels, value) {
  const code = asText(value);
  return `${Object.hasOwn(labels, code) ? labels[code] : labels.unknown} (${code || 'unknown'})`;
}

// 정상이 아니거나 확인할 수 없는 상태에는 색이 아니라 글자로 "주의"를 붙입니다.
function stateLine(labels, value) {
  const code = asText(value);
  const line = node('span', undefined, NORMAL_STATES.has(code) ? 'student-state-ok' : 'student-state-warn');
  line.dataset.studentState = code || 'unknown';
  line.textContent = `${NORMAL_STATES.has(code) ? '' : '주의: '}${stateText(labels, value)}`;
  return line;
}

// 제공 UI 의 목록 모양(dl.kv 아래 dt·dd 가 바로 이어짐)과 같게 만듭니다.
function joined(parts) {
  const holder = node('span');
  parts.forEach((part, index) => {
    if (index > 0) holder.append(' · ');
    holder.append(part);
  });
  return holder;
}

function addRow(list, term, ...parts) {
  const detail = node('dd');
  detail.append(joined(parts));
  list.append(node('dt', term), detail);
}

function drawMe(data) {
  if (!isRecord(data) || !isRecord(data.user) || !isRecord(data.device) || !isRecord(data.session)) {
    return node('p', '확인 불가: 응답 형식이 맞지 않아 사용자·기기·세션을 표시하지 않습니다.', 'state state-error');
  }
  const { user, device, session } = data;
  const list = node('dl', undefined, 'kv');
  addRow(list, '사용자', asText(user.label) || asText(user.id) || '확인 불가', `ID ${asText(user.id)}`);
  addRow(list, '현재 기기', asText(device.label) || asText(device.id) || '확인 불가', stateLine(DEVICE_LABELS, device.status), `ID ${asText(device.id)}`);
  addRow(list, '현재 세션', `ID ${asText(session.id)}`, stateLine(SESSION_LABELS, session.status));
  return list;
}

function drawList(items, emptyText, describe) {
  if (!Array.isArray(items)) return node('p', '확인 불가: 응답 형식이 맞지 않습니다.', 'state state-error');
  if (items.length === 0) return node('p', emptyText, 'state state-empty');
  const list = node('ul', undefined, 'plain-list');
  for (const item of items) {
    const entry = node('li');
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

// 자료 하나(me·devices·sessions)의 loading / ok / error 를 각각 처리합니다. 매번 새 DOM 을 만들어 돌려줍니다.
function drawResource(title, resource, draw) {
  const section = node('section');
  section.append(node('h3', title));
  const res = isRecord(resource) ? resource : {};
  const modeText = Object.hasOwn(MODE_LABELS, res.mode) ? MODE_LABELS[res.mode] : '';
  if (modeText) section.append(node('p', `${modeText} (${res.mode})`, res.mode === 'demo' ? 'tag tag-demo' : 'tag'));
  if (res.status === 'loading') {
    section.append(node('p', '불러오는 중…', 'state state-loading'));
  } else if (res.status === 'error') {
    const message = asText(isRecord(res.error) ? res.error.message : '') || '서버가 이유를 알려 주지 않았습니다.';
    section.append(node('p', `연결 실패: ${message}`, 'state state-error'));
    section.append(node('p', '확인할 수 없습니다. 이전에 보이던 값은 현재 값이 아니므로 표시하지 않습니다.', 'muted'));
  } else if (res.status === 'ok') {
    section.append(draw(res.data));
  } else {
    section.append(node('p', '확인 불가: 상태를 받지 못했습니다.', 'state state-error'));
  }
  return section;
}

function renderIdentity(input) {
  const { me, devices, sessions } = isRecord(input) ? input : {};
  const root = node('section', undefined, 'student-identity');
  root.setAttribute('aria-label', '로그인 사용자·기기·세션');
  root.append(
    drawResource('현재 로그인', me, drawMe),
    drawResource('내 기기 목록', devices, drawDevices),
    drawResource('세션 목록', sessions, drawSessions),
  );
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
