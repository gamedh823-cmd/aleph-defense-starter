-- 2단계 제작 1: 학습용 메모 테이블 (실습용 가상 자료 전용)
-- Supabase SQL Editor에서 실행합니다. 실제 키·개인정보는 넣지 않습니다.
-- 메모 본문은 이 파일에 두지 않습니다. db/seed.local.sql(커밋 제외)로 따로 넣습니다.

create table if not exists public.defense_notes (
  id         bigint generated always as identity primary key,
  title      text not null,
  content    text not null,
  owner_id   uuid,                         -- 3단계 로그인용 자리. auth.users 외래키는 걸지 않습니다.
  created_at timestamptz not null default now()
);

-- RLS를 켭니다. 정책을 만들지 않으므로 anon·authenticated는 행을 읽지 못합니다.
alter table public.defense_notes enable row level security;

-- 공개 키 역할의 테이블 권한도 회수합니다. (service_role은 RLS를 우회해 서버 함수에서만 읽습니다.)
revoke all on public.defense_notes from anon, authenticated;
