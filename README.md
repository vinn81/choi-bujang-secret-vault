# BYTE BACK 방어전 4단계 — 로그인해도 내 자료만 보이게 합니다

이 저장소는 Supabase Auth로 확인한 사용자와 메모의 `owner_id`를 비교하는 4단계 자료실입니다. 로그인 사용자는 자기 가상 메모만 추가·조회·수정·삭제할 수 있습니다. 비밀번호, JWT, 서버 전용 키, 실제 개인정보는 코드와 Git에 넣지 않습니다.

## 현재 작동

- `/`에서 Supabase Auth 로그인·로그아웃과 가상 메모 CRUD 화면을 제공합니다.
- 서버는 `src/verify-login.mjs`로 `Authorization: Bearer` 토큰을 검사하며 브라우저의 `userId`·`role`을 믿지 않습니다.
- `GET /api/notes`와 `GET /api/notes/:id`는 서버가 확인한 사용자와 `owner_id`가 같은 메모만 반환합니다.
- `POST /api/notes`는 URL·본문의 소유자 값을 믿지 않고 확인된 사용자 ID를 `owner_id`로 저장합니다.
- `PUT /api/notes/:id`는 `{title,body}`만 받아 기존 행과 수정 뒤 행의 소유자를 확인합니다.
- `DELETE /api/notes/:id`는 본인 메모만 삭제하며 상대 메모 접근은 `404`입니다.
- `/data.json`의 `notes`는 계속 빈 배열입니다.

## 4단계 접근 제어

API는 검증된 사용자 ID로 모든 메모 요청을 제한하고, 수정 본문의 `owner_id` 같은 추가 필드는 거부합니다. 학습 DB의 `public.notes`는 `anon`의 테이블 권한을 회수하고 `authenticated`에 SELECT·INSERT·UPDATE·DELETE만 허용하며, 네 RLS 정책에서 `auth.uid() = owner_id`를 검사하도록 학생이 SQL Editor에서 적용했습니다. 서버 역할은 RLS를 우회하므로 API의 소유자 검사도 함께 유지합니다.

## 설정

Vercel **Settings → Environment Variables**에는 다음 서버 전용 이름이 필요합니다.

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

값은 Vercel 비밀 입력란에만 직접 넣습니다. 브라우저에는 공개용 Project URL과 publishable key만 사용합니다.

Supabase **SQL Editor**에서 학생이 A의 가상 메모 3건과 B의 공개 가능한 시험 메모 1건에 소유자를 연결하고 `public.notes`의 최소 권한·RLS를 적용했습니다. 계정 이메일과 사용자 ID는 코드·README·제출 묶음에 기록하지 않습니다. `artifacts/`의 학습 자료와 제출 JSON은 커밋하지 않습니다.

## 실제 경로와 저장점 설정

- 실제 배포 주소: `https://choi-bujang-secret-vault-phi.vercel.app`
- 로그인 발급자·대상·JWKS: `aleph.config.json`의 `identityProvider`
- 허용 경로: `GET|POST /api/notes`, `GET|PUT|DELETE /api/notes/:id`
- 단계: `4`
- `originalApiUrl`: 5단계 전이므로 `null`
- `src/decider.mjs`의 구현 규칙: `starter.deny`

## 확인 기록

2026-10-06 기준입니다.

- 실제 배포에서 비로그인 `GET /api/notes`: HTTP `401` 확인
- 실제 배포에서 A 로그인·메모 표시·로그아웃 화면 전환: 학생 확인
- 학습 DB 소유자 연결 확인: A 3건, B 1건의 `owner_id` 비교가 모두 참
- 학습 DB 정책 확인: authenticated 전용 SELECT·INSERT·UPDATE·DELETE 정책 4개 적용
- 학생 실행 로컬 가상 요청 시험: 4개 시험 모두 통과
- 로컬 가상 요청 시험: A/B의 자기 CRUD 유지, 상대 메모 GET·PUT·DELETE `404`, 소유자 변경 `400`, 무로그인 요청 `401`
- 4단계 코드의 새 Vercel 배포와 실제 A/B 교차 접근 시험: 아직 미실행

위 기록은 학생의 실행·관찰과 로컬 자기 점검이며 심판 판정이 아닙니다. 이전 공개 커밋과 이전 배포 이력도 자동으로 삭제되지 않습니다.

## 다시 확인하기

```powershell
npm.cmd run test:notes
```

정상 결과는 A/B가 각자 자기 메모를 추가·조회·수정·삭제하는 것입니다. 거부되어야 할 결과는 상대 메모의 GET·PUT·DELETE `404`, 소유자 변경 `400`, 무로그인 자료 요청 `401`입니다. 실제 배포 후 `/`에서 A와 B로 각각 같은 흐름을 확인하며, 비밀번호나 토큰은 기록하지 않습니다.
