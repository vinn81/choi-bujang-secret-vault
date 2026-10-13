-- 11단계: 기기 승인 표입니다. Supabase SQL Editor에서 학생이 직접 실행합니다.
-- 기기 개인키는 기기의 패스키 인증기 안에만 있고, 이 표에는 공개키·승인 여부·세션 지문만 둡니다.
-- 세 표 모두 PUBLIC·anon·authenticated 권한이 없고 service_role(서버 함수)만 씁니다.

create table if not exists public.device_credentials (
  id text primary key,
  owner_id uuid not null,
  public_key text not null,
  counter bigint not null default 0,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.device_challenges (
  challenge_id bigint generated always as identity primary key,
  owner_id uuid not null,
  kind text not null check (kind in ('register', 'verify')),
  challenge text not null,
  expires_at timestamptz not null
);

create table if not exists public.device_sessions (
  token_sha256 text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null,
  credential_id text not null references public.device_credentials (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.device_credentials enable row level security;
alter table public.device_challenges enable row level security;
alter table public.device_sessions enable row level security;
revoke all on public.device_credentials, public.device_challenges, public.device_sessions from public, anon, authenticated;
grant select, insert, update on public.device_credentials to service_role;
grant select, insert, delete on public.device_challenges to service_role;
grant select, insert on public.device_sessions to service_role;

-- 승인 대기 기기 보기(공개키는 보지 않음):
-- select id, owner_id, approved, created_at from public.device_credentials order by created_at desc;

-- 승인: 화면의 버튼이 아니라 여기서 학생이 직접 한 기기만 승인합니다.
-- update public.device_credentials set approved = true, approved_at = now() where id = '<기기 ID>';

-- 승인 거두기: 다음 요청부터 그 기기의 세션이 거부됩니다.
-- update public.device_credentials set approved = false, approved_at = null where id = '<기기 ID>';
