-- 8단계: 자료 구역(메모 / 강사 공지)과 강사 권한. 실습용 가상 자료 전용입니다.
-- Supabase SQL Editor에서 실행합니다. 배포(push)보다 먼저 실행해야 새 API가 정상 동작합니다.

-- 구역: memo = 소유자만, notice = 로그인한 사용자가 읽고 저장된 강사만 수정. 기존 메모는 모두 memo가 됩니다.
alter table public.defense_memos
  add column if not exists zone text not null default 'memo';

alter table public.defense_memos drop constraint if exists defense_memos_zone_check;
alter table public.defense_memos
  add constraint defense_memos_zone_check check (zone in ('memo', 'notice'));

create index if not exists defense_memos_zone_idx on public.defense_memos (zone);

-- 강사 권한은 이 테이블에 저장된 사용자만 갖습니다. 토큰·화면·요청 본문의 role은 쓰지 않습니다.
create table if not exists public.defense_instructors (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.defense_instructors enable row level security;
revoke all on public.defense_instructors from public, anon, authenticated;
grant select on public.defense_instructors to service_role;

-- 새 열의 권한도 서버(service_role)만 씁니다. 5단계에서 회수한 직접 권한은 그대로입니다.
select has_table_privilege('anon', 'public.defense_instructors', 'select')          as anon_instructors,
       has_table_privilege('authenticated', 'public.defense_instructors', 'select') as authenticated_instructors,
       has_table_privilege('anon', 'public.defense_memos', 'select')                as anon_memos,
       has_table_privilege('authenticated', 'public.defense_memos', 'select')       as authenticated_memos;
-- 위 네 값이 모두 false여야 합니다.

-- (선택) 시험용 강사 공지 한 건과 강사 등록은 커밋하지 않는 db/zones.local.sql에 둡니다. 예:
--   insert into public.defense_memos (title, body, owner_id, zone)
--     values ('가상 강사 공지', '실습용 공지입니다.', '<강사 사용자 UUID>', 'notice');
--   insert into public.defense_instructors (user_id) values ('<강사 사용자 UUID>');
