-- 4단계 제작 3: defense_memos의 RLS와 최소 권한 (실습용 가상 자료 전용)
-- 검토한 뒤 Supabase SQL Editor에서 실행합니다. 다른 테이블은 건드리지 않습니다.
-- 앱 서버는 service_role로 읽고 쓰며 소유자 검사는 서버 코드가 합니다. RLS는 직접 접근에 대한 두 번째 방어선입니다.

-- 1) 기존 권한을 모두 회수합니다.
revoke all on table public.defense_memos from public, anon, authenticated;

-- 2) authenticated에는 네 가지 권한만 줍니다. anon에는 아무것도 주지 않습니다.
grant select, insert, update, delete on table public.defense_memos to authenticated;
grant select, insert, update, delete on table public.defense_memos to service_role;

-- 3) RLS를 켜고, 본인 행만 허용하는 정책을 만듭니다.
alter table public.defense_memos enable row level security;

drop policy if exists memos_select_own on public.defense_memos;
drop policy if exists memos_insert_own on public.defense_memos;
drop policy if exists memos_update_own on public.defense_memos;
drop policy if exists memos_delete_own on public.defense_memos;

create policy memos_select_own on public.defense_memos
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy memos_insert_own on public.defense_memos
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy memos_update_own on public.defense_memos
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy memos_delete_own on public.defense_memos
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- 4) 확인: 실제 권한을 두 방식으로 대조합니다.
-- 4-1) 역할별 테이블 권한 (anon에는 행이 없어야 하고 authenticated에는 네 가지만 있어야 합니다)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'defense_memos'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

-- 4-2) has_table_privilege 대조
select r.role,
       has_table_privilege(r.role, 'public.defense_memos', 'select') as can_select,
       has_table_privilege(r.role, 'public.defense_memos', 'insert') as can_insert,
       has_table_privilege(r.role, 'public.defense_memos', 'update') as can_update,
       has_table_privilege(r.role, 'public.defense_memos', 'delete') as can_delete
from (values ('anon'), ('authenticated')) as r(role);

-- 4-3) RLS 켜짐과 정책 목록
select relrowsecurity as rls_enabled from pg_class where oid = 'public.defense_memos'::regclass;
select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'defense_memos';
