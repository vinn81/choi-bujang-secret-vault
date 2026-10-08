# BYTE BACK 방어전 5단계 — 자료 요청을 서버 한곳으로 모읍니다

브라우저의 가상 메모 읽기·추가·수정·삭제를 Vercel 서버 함수로만 처리하는 5단계 자료실입니다. Supabase Auth 로그인과 서버의 토큰·소유자 검사는 유지하며, 원본 `public.notes`에 대한 PUBLIC·anon·authenticated 직접 권한은 회수합니다.

## 현재 작동

- `/`에서 Supabase Auth 로그인·로그아웃과 본인 가상 메모 CRUD 화면을 제공합니다.
- 화면은 `/api/notes`와 `/api/notes/:id`만 호출하고 원본 자료 API를 직접 호출하지 않습니다.
- 서버는 Bearer 토큰을 검증하고 확인된 사용자 ID와 `owner_id`가 같은 메모만 처리합니다.
- Auth용 Project URL과 publishable key 값은 정적 화면 코드에 두지 않고 서버 환경설정에서 전달합니다.
- `/data.json`의 `notes`는 빈 배열이며 `/aleph.json`에는 배포 정보와 허용 경로를 기록합니다.
- 보너스 XDR은 가상 Wazuh 무차별 로그인 경보를 `block`·`alert`·`record`로 나누고, `block` 주소만 15분 만료 거부 규칙 후보로 만듭니다.

## 보너스 XDR xdr-01

`xdr/fixtures/brute-force.json`의 수업용 경보를 읽어 MITRE ATT&CK T1110 기반 패턴과 비교합니다. 명확한 공격만 `xdr/brute-force/deny-rules.json`에 만료 시각·근거 경보 번호와 함께 기록하고, `block`·`alert` 알림은 `xdr/alerts.log`에 JSON 한 줄씩 누적합니다. 정상 이벤트와 애매한 경보는 거부 규칙에 넣지 않습니다.

이 기능은 로컬 가상 경보 연습입니다. 운영 Wazuh 사건 전달, 검증된 출발 주소 전달, 실제 ZTNA 차단 집행은 연결됐다고 표시하지 않습니다. 기존 `src/decider.mjs` 규칙은 변경하지 않았습니다.

## 5단계 접근 제어

학습 DB의 `public.notes`에서 PUBLIC·anon·authenticated의 직접 CRUD 권한을 회수했습니다. SQL Editor의 실효 권한 확인에서 anon·authenticated는 SELECT·INSERT·UPDATE·DELETE가 모두 `false`, service_role은 모두 `true`였습니다. 서버 함수는 서버 전용 설정으로 자료를 처리하면서 로그인과 소유자 검사를 계속 적용합니다.

## 설정

Vercel **Settings → Environment Variables**에는 다음 서버 전용 이름이 필요합니다.

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

값은 공식 설정 화면에서 Vercel 입력란에만 직접 넣습니다. 비밀번호, JWT, 서버 전용 키, 계정 이메일과 실제 개인정보는 코드·로그·README·제출 묶음에 기록하지 않습니다. `artifacts/`와 `bundle-notes.json`도 커밋하지 않습니다.

## 실제 경로와 저장점 설정

- 실제 배포 주소: `https://choi-bujang-secret-vault-phi.vercel.app`
- 로그인 발급자·대상·JWKS: `aleph.config.json`의 `identityProvider`
- 허용 경로: `GET|POST /api/notes`, `GET|PUT|DELETE /api/notes/:id`
- 단계: `5`
- 원본 API: `aleph.config.json`의 쿼리 없는 `originalApiUrl`
- `src/decider.mjs`의 구현 규칙: `starter.deny`

## 확인 기록

2026-10-06 기준입니다.

- 학생 확인 실제 화면: A의 메모 추가 `201`, 목록·수정 `200`, 삭제 `204`, 삭제 뒤 목록 `200`
- 학생 확인 학습 DB 권한: anon·authenticated CRUD 모두 `false`, service_role CRUD 모두 `true`
- 로컬 가상 요청 시험: A/B 자기 CRUD 유지, 상대 메모 GET·PUT·DELETE `404`, 소유자 변경 `400`, 무로그인 요청 `401`
- 정적 화면 코드의 Supabase 공개 키 값 제거와 `/aleph.json`의 `allowedRoutes` 생성 시험 통과
- 2026-10-08 보너스 XDR 가상 경보: `block` 10건, `alert` 9건, `record` 9건이며 정상 이벤트 차단 0건
- 5단계 커밋의 새 Vercel 배포, 새 `/aleph.json`, 첫 화면 보안 헤더 실응답: 아직 미실행
- anon 키를 사용한 원본 API 직접 HTTP 요청: 아직 미실행

위 기록은 학생의 실행·관찰과 로컬 자기 점검이며 심판 판정이 아닙니다.

## 다시 확인하기

```powershell
npm.cmd run test:notes
```

정상 결과는 A/B가 서버 함수를 통해 각자 자기 메모를 추가·조회·수정·삭제하는 것입니다. 거부되어야 할 결과는 원본 API 직접 요청의 `401` 또는 `403`, 상대 메모 접근 `404`, 소유자 변경 `400`, 무로그인 자료 요청 `401`입니다. 새 커밋을 배포한 뒤 `/aleph.json`의 `allowedRoutes`와 첫 화면의 `X-Content-Type-Options: nosniff`도 확인합니다.

보너스 XDR을 다시 실행합니다.

```powershell
npm.cmd run xdr:run -- brute-force
```

정상 결과는 `result.json`의 `block` 10건·`alert` 9건·`record` 9건과 정상 이벤트 차단 0건입니다. 애매하거나 정상인 경보 주소가 `deny-rules.json`에 들어가면 안 됩니다. `alerts.log`는 실행할 때마다 새 알림 줄을 누적합니다.
