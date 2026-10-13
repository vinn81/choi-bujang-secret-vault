-- 12단계: 서버 요청 기록 표입니다. Supabase SQL Editor에서 학생이 직접 한 번 실행합니다.
-- 자료 API(/api/notes, /api/notes/:id, /api/ops, /data.json)가 받은 요청마다 한 줄을 남깁니다.
-- 요청 ID·점검 이름·방법·경로·상태·소유자 키(비로그인은 null)·시각만 두고, 메모 본문·토큰·요청 본문은 두지 않습니다.
-- PUBLIC·anon·authenticated 권한이 없고 service_role(서버 함수)만 씁니다.

create table if not exists public.access_log (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  attack_id text check (attack_id is null or attack_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'),
  method text not null check (char_length(method) <= 10),
  route text not null check (char_length(route) <= 40),
  status integer not null check (status between 100 and 599),
  owner_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists access_log_owner_created on public.access_log (owner_id, created_at desc);

alter table public.access_log enable row level security;
revoke all on public.access_log from public, anon, authenticated;
grant select, insert on public.access_log to service_role;

-- 최근 기록 보기:
-- select request_id, attack_id, method, route, status, owner_id is null as anonymous, created_at
--   from public.access_log order by created_at desc limit 20;
