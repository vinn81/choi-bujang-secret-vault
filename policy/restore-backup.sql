-- 10단계: 비공개 가상 메모 사본과 복원 감사 기록 표입니다.
-- Supabase SQL Editor에서 학생이 직접 실행합니다. 서버 전용 키나 메모 본문을 이 파일에 적지 않습니다.
-- 두 표 모두 PUBLIC·anon·authenticated 권한이 없고 service_role(서버 함수)만 씁니다.

create table if not exists public.notes_backup (
  id uuid primary key,
  owner_id uuid not null,
  title text not null,
  content text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now()
);

create table if not exists public.notes_restore_audit (
  audit_id bigint generated always as identity primary key,
  note_id uuid not null,
  owner_id uuid not null,
  before_sha256 text,
  after_sha256 text not null,
  restored_at timestamptz not null default now()
);

alter table public.notes_backup enable row level security;
alter table public.notes_restore_audit enable row level security;
revoke all on public.notes_backup, public.notes_restore_audit from public, anon, authenticated;
grant select on public.notes_backup to service_role;
-- 감사 기록은 덧붙이기·읽기만 허용하고 수정·삭제 권한은 주지 않습니다.
revoke update, delete, truncate on public.notes_restore_audit from service_role;
grant select, insert on public.notes_restore_audit to service_role;

-- 10단계 수정: 성공·실패와 상관없이 모든 복원 시도를 감사 기록에 남기도록 결과 칸을 더하고, 실패 시도는 복원 뒤 해시가 비어 있을 수 있게 합니다.
alter table public.notes_restore_audit add column if not exists result text not null default 'restored';
alter table public.notes_restore_audit alter column after_sha256 drop not null;

-- 사본 만들기: 침해 전에 검증한 상태에서 대상 메모만 넣습니다(예: 시험 계정 B의 메모 한 건).
-- 내용 해시는 제목 + 줄바꿈 + 본문의 SHA-256이며 api/restore.js와 같은 식입니다.
-- insert into public.notes_backup (id, owner_id, title, content, content_sha256)
-- select id, owner_id, title, content, encode(sha256(convert_to(title || E'\n' || content, 'UTF8')), 'hex')
-- from public.notes where id = '<B 메모 UUID>'
-- on conflict (id) do nothing;
