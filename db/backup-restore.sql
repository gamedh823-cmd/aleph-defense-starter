-- 10단계: 메모 사본(불변)과 감사 기록. 실습용 가상 자료 전용입니다.
-- Supabase SQL Editor에서 실행합니다. 배포(push)보다 먼저 실행해야 복구 경로가 정상 동작합니다.
-- 사본 해시 정의: sha256( 메모ID | 소유자ID | 제목 | 본문 ) 의 16진수. 앱(src/restore.mjs)이 같은 식으로 다시 계산해 대조합니다.

create table if not exists public.defense_memo_backups (
  memo_id        uuid primary key,
  owner_id       uuid not null,
  title          text not null,
  body           text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  backed_up_at   timestamptz not null default now()
);

-- 메모가 만들어질 때 자동으로 사본을 한 번만 남깁니다(이미 있으면 그대로). 수정·삭제는 사본에 영향을 주지 않습니다.
create or replace function public.defense_backup_memo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.zone = 'memo' then
    insert into public.defense_memo_backups (memo_id, owner_id, title, body, content_sha256)
    values (new.id, new.owner_id, new.title, new.body,
      encode(sha256(convert_to(new.id::text || '|' || new.owner_id::text || '|' || new.title || '|' || new.body, 'UTF8')), 'hex'))
    on conflict (memo_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists defense_memos_backup on public.defense_memos;
create trigger defense_memos_backup after insert on public.defense_memos
  for each row execute function public.defense_backup_memo();

-- 지금 있는 메모의 사본(검증 전에 한 번). 이미 사본이 있는 메모는 건너뜁니다.
insert into public.defense_memo_backups (memo_id, owner_id, title, body, content_sha256)
select id, owner_id, title, body,
  encode(sha256(convert_to(id::text || '|' || owner_id::text || '|' || title || '|' || body, 'UTF8')), 'hex')
from public.defense_memos where zone = 'memo'
on conflict (memo_id) do nothing;

-- 감사 기록: 추가와 조회만 되고 수정·삭제는 막습니다. 복구가 일어나도 기록은 그대로 남습니다.
create table if not exists public.defense_audit (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  action  text not null check (char_length(action) between 1 and 40),
  memo_id uuid,
  owner_id uuid,
  detail  jsonb not null default '{}'::jsonb
);

-- 권한: 서버(service_role)만 쓰고, 사본은 읽기만, 감사 기록은 추가·조회만 됩니다.
alter table public.defense_memo_backups enable row level security;
alter table public.defense_audit enable row level security;
revoke all on public.defense_memo_backups from public, anon, authenticated;
revoke all on public.defense_audit from public, anon, authenticated;
revoke all on public.defense_memo_backups from service_role;
revoke all on public.defense_audit from service_role;
grant select on public.defense_memo_backups to service_role;
grant select, insert on public.defense_audit to service_role;

-- 확인: 사본 수가 메모 수 이상이어야 하고, 아래 권한 값은 모두 false여야 합니다(앞의 두 값은 true).
select (select count(*) from public.defense_memos where zone = 'memo')  as memos,
       (select count(*) from public.defense_memo_backups)               as backups,
       has_table_privilege('service_role', 'public.defense_memo_backups', 'update') as backup_update,
       has_table_privilege('service_role', 'public.defense_audit', 'delete')        as audit_delete,
       has_table_privilege('anon', 'public.defense_memo_backups', 'select')         as anon_backups,
       has_table_privilege('authenticated', 'public.defense_audit', 'select')       as authenticated_audit;
