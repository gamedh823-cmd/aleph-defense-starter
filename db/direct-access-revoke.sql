-- 5단계 제작 2: 브라우저·공개 키가 학습용 메모 테이블을 직접 부르는 길을 닫습니다.
-- 검토한 뒤 Supabase SQL Editor에서 실행합니다. 다른 테이블은 건드리지 않습니다.
-- 서버 함수는 service_role로 접속하므로 화면 동작은 그대로입니다. (소유자 검사는 서버 코드가 계속 합니다.)

-- 1) 적용 전 권한을 먼저 확인합니다. (결과를 캡처해 두세요.)
select r.role,
       has_table_privilege(r.role, 'public.defense_memos', 'select') as can_select,
       has_table_privilege(r.role, 'public.defense_memos', 'insert') as can_insert,
       has_table_privilege(r.role, 'public.defense_memos', 'update') as can_update,
       has_table_privilege(r.role, 'public.defense_memos', 'delete') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as r(role);

-- 2) 직접 권한 회수: PUBLIC, anon, authenticated
revoke all on table public.defense_memos from public, anon, authenticated;

-- 3) 서버 함수가 쓰는 service_role 권한은 유지합니다.
grant select, insert, update, delete on table public.defense_memos to service_role;

-- 4) 적용 후 다시 확인합니다. anon·authenticated는 모두 false, service_role은 모두 true여야 합니다.
select r.role,
       has_table_privilege(r.role, 'public.defense_memos', 'select') as can_select,
       has_table_privilege(r.role, 'public.defense_memos', 'insert') as can_insert,
       has_table_privilege(r.role, 'public.defense_memos', 'update') as can_update,
       has_table_privilege(r.role, 'public.defense_memos', 'delete') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as r(role);
