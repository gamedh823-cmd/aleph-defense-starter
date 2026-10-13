// 8단계: 자료 구역. 메모(memo)는 소유자만, 강사 공지(notice)는 로그인한 사용자가 읽고 저장된 강사만 고칩니다.
// 구역과 강사 권한은 DB에 저장된 값만 믿습니다. 화면 메뉴나 요청 본문의 role·zone은 쓰지 않습니다.
export const ZONES = Object.freeze({ memo: 'memo', notice: 'notice' });

// 요청마다 서버가 구별하는 자원 ID. 예: memo:<uuid>, notice:<uuid>
export const resourceId = (zone, id) => `${zone}:${id}`;

// 판단만 하고 부수 효과는 없습니다. status는 API가 그대로 돌려주고, reason은 짧은 거부 사유 코드입니다.
export function authorizeNote({ row, userId, instructor, action }) {
  if (!row || (row.zone !== ZONES.memo && row.zone !== ZONES.notice)) {
    return { allow: false, status: 404, reason: 'resource_unknown' };
  }
  if (row.zone === ZONES.memo) {
    return row.owner_id === userId
      ? { allow: true }
      : { allow: false, status: 404, reason: 'memo_not_owner' };
  }
  if (action === 'read') return { allow: true };
  if (action === 'update' && instructor === true) return { allow: true };
  return { allow: false, status: 403, reason: 'notice_instructor_only' };
}
