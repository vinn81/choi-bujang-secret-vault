# BYTE BACK 방어전 3단계 — 진짜 로그인을 붙입니다

이 저장소는 Supabase Auth 이메일·비밀번호 로그인과 서버 토큰 검사를 붙인 3단계 자료실입니다. 로그인 사용자는 가상 메모를 추가·조회·수정·삭제할 수 있습니다. 비밀번호, JWT, 서버 전용 키, 실제 개인정보는 코드와 Git에 넣지 않습니다.

## 현재 작동

- `/`에서 Supabase Auth 로그인·로그아웃과 가상 메모 CRUD 화면을 제공합니다.
- 서버는 `src/verify-login.mjs`로 `Authorization: Bearer` 토큰을 검사하며 브라우저의 `userId`·`role`을 믿지 않습니다.
- `GET /api/notes`는 서버가 확인한 로그인 사용자의 메모 배열만 반환합니다.
- `POST /api/notes`는 서버가 확인한 사용자 ID를 `owner_id`로 저장하고 `{id}`를 반환합니다.
- `GET`·`PUT`·`DELETE /api/notes/:id`는 한 건 조회·수정·삭제를 처리하며 삭제 뒤 GET은 `404`입니다.
- `/data.json`의 `notes`는 계속 빈 배열입니다.

## 3단계에 남긴 약점

개별 메모 API는 로그인 여부만 검사하고 메모 소유자는 아직 검사하지 않습니다. 따라서 ID를 아는 B가 A의 메모를 조회·수정·삭제할 가능성이 있으며, 이 접근 제어는 4단계에서 추가합니다. B의 타인 메모 접근 시험도 4단계에서 기록합니다.

## 설정

Vercel **Settings → Environment Variables**에는 다음 서버 전용 이름이 필요합니다.

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

값은 Vercel 비밀 입력란에만 직접 넣습니다. 브라우저에는 공개용 Project URL과 publishable key만 사용합니다.

Supabase **SQL Editor**에서는 로컬 학습 자료 `artifacts/step3-supabase.sql`을 실행해 서버 역할에 `notes`의 조회·추가·수정·삭제 권한을 줍니다. 이 파일은 `artifacts/` 아래에 있어 커밋하지 않습니다.

## 실제 경로와 저장점 설정

- 실제 배포 주소: `https://choi-bujang-secret-vault-phi.vercel.app`
- 로그인 발급자·대상·JWKS: `aleph.config.json`의 `identityProvider`
- 허용 경로: `GET|POST /api/notes`, `GET|PUT|DELETE /api/notes/:id`
- `originalApiUrl`: 5단계 전이므로 `null`
- `src/decider.mjs`의 구현 규칙: `starter.deny`

## 확인 기록

2026-10-06 기준입니다.

- 실제 배포에서 비로그인 `GET /api/notes`: HTTP `401` 확인
- 실제 배포에서 A 로그인·메모 표시·로그아웃 화면 전환: 학생 확인
- 로컬 가상 요청 시험: A의 추가·목록·한 건 조회·수정·삭제와 삭제 뒤 `404` 통과
- 로컬 가상 요청 시험: 무로그인 GET·POST·PUT·DELETE `401` 통과
- CRUD가 포함된 이번 저장점의 새 Vercel 배포와 실제 A CRUD: 아직 미실행
- B의 타인 메모 접근: 4단계로 남겨 미실행

위 기록은 학생의 실행·관찰과 로컬 자기 점검이며 심판 판정이 아닙니다. 이전 공개 커밋과 이전 배포 이력도 자동으로 삭제되지 않습니다.

## 다시 확인하기

```powershell
npm.cmd run test:notes
```

정상 결과는 A의 추가·수정·삭제와 삭제 뒤 `404`입니다. 거부되어야 할 결과는 무로그인 자료 요청의 `401`입니다. 실제 배포 후 `/`에서 A 계정으로 같은 흐름을 직접 확인하며, 비밀번호나 토큰은 기록하지 않습니다.
