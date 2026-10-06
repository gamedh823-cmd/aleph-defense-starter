-- 3단계: 로그인한 사용자의 가상 메모 테이블 (실습용 가상 자료 전용)
-- Supabase SQL Editor에서 실행합니다. 실제 키·개인정보는 넣지 않습니다.

create table if not exists public.defense_memos (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 200),
  body       text not null default '' check (char_length(body) <= 5000),
  owner_id   uuid not null,                -- 서버가 확인한 로그인 사용자 ID. auth.users 외래키는 걸지 않습니다.
  created_at timestamptz not null default now()
);

create index if not exists defense_memos_owner_idx on public.defense_memos (owner_id);

-- RLS를 켜고 정책은 만들지 않습니다. anon·authenticated는 읽거나 쓰지 못합니다.
alter table public.defense_memos enable row level security;
revoke all on public.defense_memos from anon, authenticated;

-- 서버 함수가 쓰는 service_role에만 필요한 권한을 명시합니다.
grant select, insert, update, delete on public.defense_memos to service_role;
