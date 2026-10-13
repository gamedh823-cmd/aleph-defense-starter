-- 11단계: 기기 승인 요청 기록. 실습용 가상 자료 전용입니다.
-- Supabase SQL Editor에서 실행합니다. 배포(push)보다 먼저 실행해야 새 화면이 승인 상태를 읽을 수 있습니다.
-- 승인은 이 SQL Editor(운영자)에서만 합니다. 앱 서버(service_role)는 요청 기록을 만들고 읽을 수만 있고, 승인·거부는 못 합니다.

create table if not exists public.defense_device_approvals (
  request_id   uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  label        text not null default '' check (char_length(label) <= 60),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz
);

create index if not exists defense_device_approvals_user_idx on public.defense_device_approvals (user_id, requested_at desc);

alter table public.defense_device_approvals enable row level security;
revoke all on public.defense_device_approvals from public, anon, authenticated;
revoke all on public.defense_device_approvals from service_role;
grant select, insert on public.defense_device_approvals to service_role;

-- 확인: service_role은 select·insert만 true, update는 false(앱이 스스로 승인하지 못함), anon·authenticated는 모두 false여야 합니다.
select has_table_privilege('service_role', 'public.defense_device_approvals', 'select')  as app_select,
       has_table_privilege('service_role', 'public.defense_device_approvals', 'insert')  as app_insert,
       has_table_privilege('service_role', 'public.defense_device_approvals', 'update')  as app_update,
       has_table_privilege('anon', 'public.defense_device_approvals', 'select')          as anon_select,
       has_table_privilege('authenticated', 'public.defense_device_approvals', 'select') as authenticated_select;

-- 운영자가 승인하는 방법(예시, 커밋하지 않는 db/device-approval.local.sql에 둡니다):
--   select request_id, user_id, label, status, requested_at from public.defense_device_approvals order by requested_at desc;
--   update public.defense_device_approvals set status = 'approved', decided_at = now() where request_id = '<요청 번호>';
--   (회수) update public.defense_device_approvals set status = 'revoked', decided_at = now() where request_id = '<요청 번호>';
