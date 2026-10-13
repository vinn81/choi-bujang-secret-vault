# BYTE BACK 방어전 8단계 — 자료마다 갈 수 있는 구역을 나눕니다

브라우저의 가상 메모 읽기·추가·수정·삭제를 Vercel 서버 함수로만 처리합니다. 판정기는 등록 기기, 평소와 다른 복합 접속, 자원 구역별 정확한 경로를 차례로 확인하고, 자료 API도 검증된 사용자와 구역·소유자를 다시 대조하는 8단계 자료실입니다. Supabase Auth 로그인과 서버의 토큰·소유자 검사는 유지하며, 원본 `public.notes`에 대한 PUBLIC·anon·authenticated 직접 권한은 회수합니다.

## 현재 작동

- `/`에서 Supabase Auth 로그인·로그아웃과 본인 가상 메모 CRUD 화면을 제공합니다.
- 화면은 `/api/notes`와 `/api/notes/:id`만 호출하고 원본 자료 API를 직접 호출하지 않습니다.
- 서버는 Bearer 토큰을 검증하고 확인된 사용자 ID와 `owner_id`가 같은 메모만 처리합니다.
- Auth용 Project URL과 publishable key 값은 정적 화면 코드에 두지 않고 서버 환경설정에서 전달합니다.
- 판정기(`src/decider.mjs`)는 `deviceRegistered`가 `true`인 기기의 내 메모 읽기만 허용하고, 미등록이거나 값이 없으면 `device_not_registered`로 거부합니다.
- 판정기는 엔진이 검증한 `judge_fixture` 신호에서 이상 시각·처음 보는 네트워크·대량 읽기가 모두 겹치면 `step_up`·`step_up_required`를 돌려줍니다. 다른 출처의 신호는 신뢰하지 않습니다.
- 자원은 `src/resources.mjs`에서 `notes.own`(내 메모)과 `notices.instructor`(강사 공지, 자료·API 없음)로 나뉩니다. 판정기 `resource_zone`은 자기 메모 읽기·수정만 허용하고, 강사 공지 수정은 `instructor_role_required`, 표에 없거나 쿼리가 붙은 경로는 `route_not_allowed`로 거부합니다.
- 자료 API는 응답에 `X-Resource-Id`를 붙이고, 검증된 로그인 종류·사용자 ID가 구역과 맞지 않으면 `403`으로 거부합니다. 소유자는 계속 `owner_id`로 확인하며 본문·쿼리의 `role`·`owner_id`는 믿지 않습니다.
- `/data.json`의 `notes`는 빈 배열이며 `/aleph.json`에는 배포 정보와 허용 경로를 기록합니다.
- 보너스 XDR은 가상 Wazuh 무차별 로그인 경보를 `block`·`alert`·`record`로 나누고, `block` 주소만 15분 만료 거부 규칙 후보로 만듭니다.
- 보너스 XDR xdr-02는 가상 웹 주입 경보를 같은 세 단계로 나누고, 반복된 명확한 주입 시도의 주소만 15분 만료 거부 규칙 후보로 만듭니다.

## 보너스 XDR xdr-01

`xdr/fixtures/brute-force.json`의 수업용 경보를 읽어 MITRE ATT&CK T1110 기반 패턴과 비교합니다. 명확한 공격만 `xdr/brute-force/deny-rules.json`에 만료 시각·근거 경보 번호와 함께 기록하고, `block`·`alert` 알림은 `xdr/alerts.log`에 JSON 한 줄씩 누적합니다. 정상 이벤트와 애매한 경보는 거부 규칙에 넣지 않습니다.

이 기능은 로컬 가상 경보 연습입니다. 운영 Wazuh 사건 전달, 검증된 출발 주소 전달, 실제 ZTNA 차단 집행은 연결됐다고 표시하지 않습니다. 기존 `src/decider.mjs` 규칙은 변경하지 않았습니다.

`connect.mjs`에 `decideWithTemporaryDeny` 연결 함수를 추가했습니다. 검증된 출발 주소와 운영 등록 정책을 별도로 받으며, 차단하지 않은 요청은 기존 판정기로 전달합니다. 실제 운영 호출부와 출발 주소 계약은 현재 자료실에 없어 연결을 완료하지 않았습니다. 필요한 항목은 `docs/XDR_INTEGRATION.md`에 정리했습니다.

`npm.cmd run xdr:test`로 원본 분류, 문구 변형, 차단 규칙·알림, 만료 해제와 기존 판정기 응답 보존을 확인합니다. 정상 허용은 시험용 판정기로 확인하며, 실제 시작 판정기의 `starter.deny`는 유지됩니다.

## 보너스 XDR xdr-02

`xdr/fixtures/web-injection.json`의 수업용 경보를 MITRE ATT&CK T1190 기반 패턴 4개(SQL 구문·스크립트 태그·경로 거슬러 올라가기·명령 구분자, `xdr/web-injection/patterns.json`)와 비교합니다. `decide.mjs`는 import·파일 읽기·외부 호출 없이 판단만 하며, 같은 주소에서 5회 이상 반복된 주입 시도만 `block`입니다. `respond.mjs`가 `block` 주소만 `xdr/web-injection/deny-rules.json`에 만료 시각·근거 경보 번호와 함께 넣고 `block`·`alert` 알림을 `xdr/alerts.log`에 쌓습니다. 실행기(`npm run xdr:run`)는 `connect.mjs`만 부르므로 규칙·알림 갱신은 `node xdr/web-injection/respond.mjs`로 합니다. 운영 엔진 연결과 기존 `src/decider.mjs` 규칙은 xdr-01과 같이 바꾸지 않았습니다.

## 8단계 자원 구역

- 판정기는 엔진이 확인한 `subjectId`·`deviceId`·`method`·`route`·`path`·`service`가 서로 맞고 `queryLength`가 0일 때만 구역 규칙을 적용합니다. `:id` 자리에는 자료 ID 한 칸만 받습니다.
- 판정기는 가명 `subjectId`로 메모 주인을 알 수 없습니다. B가 A 메모를 여는 요청은 자료 API가 `owner_id` 조건으로 `404`를 돌려 막습니다.
- 강사 권한을 저장한 자료가 없고 판정 계약에 역할 항목이 없어, 강사 공지 수정은 누구에게도 허용하지 않습니다.

로컬 확인(2026-10-13): A 자기 메모 목록·읽기·수정 `allow`/`200`, B의 A 메모 읽기·수정 `404`, 쿼리 `owner_id` 위조 시 메모 0건, 본문 `role` 섞인 수정 `400`, 알 수 없는 로그인 종류 `403`, 학생 공지 수정 `deny`·`instructor_role_required`. 가상 요청 연습이며 심판 판정이 아닙니다.

## 7단계 평소와 다른 접속 재확인

`src/decider.mjs`의 `step_up_required` 규칙은 엔진이 검증한 `judge_fixture` 신호에서 평소와 다른 시각(0~5시), 처음 보는 네트워크(`unusual`), 최근 10분 대량 읽기(사건 10건 이상)가 모두 겹칠 때만 `step_up`을 요구합니다. 지역 하나만으로는 거부하지 않습니다. 엔진이 넘긴 `stepUp.verified`가 `true`이고 재로그인한 지 300초 이내이면 다시 판정해 허용합니다.

재로그인 계약 확인(2026-10-13): `docs/DECIDER_REQUEST.md`에는 엔진이 새 로그인 시각을 넘기는 `stepUp: {verified, authAgeSeconds}` 항목이 있습니다. 하지만 이를 채우는 제공 엔진(`student-kit/sdp-core`)은 이 저장소에 없고, 자료실 API(`api/`)도 판정기를 호출하지 않습니다.

- 가상 사건 규칙 시험(`npm.cmd run decider:test`, `npm.cmd run fixture:7`): 정상 `allow`, 복합 이상 `step_up`, 재로그인한 복합 이상 `allow`
- 다시 로그인하기 전의 실제 자료 차단과 새 로그인 뒤 요청 허용: 미실행(계약을 채우는 엔진이 준비된 환경에서만 실측)

토큰 원문은 판정 요청·로그·README에 기록하지 않습니다. 위 결과는 가상 요청 연습이며 심판 판정이 아닙니다.

## 6단계 등록 기기 판정 규칙

`src/decider.mjs`의 `device_registered` 규칙은 `docs/DECIDER_REQUEST.md` 계약의 `request.deviceRegistered`가 `true`일 때만 내 자료실 읽기(`GET /notes`, `GET /notes/:id`)를 `allow`합니다. 값이 `false`이거나 없으면 `deny`·`device_not_registered`로 거부합니다. 그 밖의 요청은 기존 `starter.deny`로 거부합니다. 따로 설치할 접속 프로그램은 없습니다. 기존 자료실 주소와 브라우저 화면은 그대로입니다.

확인 순서:

1. `npm.cmd run decider:test`를 실행합니다.
2. `통과 · 등록 기기의 정상 요청`이 나오면 등록 기기의 읽기 요청이 `allow`된 것입니다.
3. `통과 · 미등록 기기의 가상 요청`이 나오면 `deviceRegistered: false` 요청이 `deny`·`device_not_registered`로 거부된 것입니다.
4. 둘 중 하나라도 `확인 필요`이거나 `판정기 연습 첫 오류`가 나오면 `src/decider.mjs`의 `RULE_IDS`와 규칙을 확인합니다.

2026-10-13 로컬 실행에서 두 항목이 모두 `통과`였습니다. 이 결과는 가상 요청 연습이며 심판 판정이 아닙니다. 미등록 기기 공격 시험은 심판이 맡습니다.

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
- 단계: `8`
- 원본 API: `aleph.config.json`의 쿼리 없는 `originalApiUrl`
- `src/decider.mjs`의 구현 규칙: `starter.deny`, `device_registered`, `step_up_required`, `resource_zone`

## 확인 기록

2026-10-06 기준입니다.

- 학생 확인 실제 화면: A의 메모 추가 `201`, 목록·수정 `200`, 삭제 `204`, 삭제 뒤 목록 `200`
- 학생 확인 학습 DB 권한: anon·authenticated CRUD 모두 `false`, service_role CRUD 모두 `true`
- 로컬 가상 요청 시험: A/B 자기 CRUD 유지, 상대 메모 GET·PUT·DELETE `404`, 소유자 변경 `400`, 무로그인 요청 `401`
- 정적 화면 코드의 Supabase 공개 키 값 제거와 `/aleph.json`의 `allowedRoutes` 생성 시험 통과
- 2026-10-08 보너스 XDR 가상 경보: `block` 10건, `alert` 9건, `record` 9건이며 정상 이벤트 차단 0건
- 2026-10-08 보너스 XDR xdr-02 가상 웹 주입 경보: `block` 8건, `alert` 9건, `record` 9건이며 정상 이벤트 차단 0건
- 5단계 커밋의 새 Vercel 배포, 새 `/aleph.json`, 첫 화면 보안 헤더 실응답: 아직 미실행
- anon 키를 사용한 원본 API 직접 HTTP 요청: 아직 미실행

위 기록은 학생의 실행·관찰과 로컬 자기 점검이며 심판 판정이 아닙니다.

## 다시 확인하기

6·7단계 판정기를 확인합니다.

```powershell
npm.cmd run decider:test
npm.cmd run fixture:7
```

정상 결과는 `통과 · 등록 기기의 정상 요청`, `통과 · 다시 확인한 복합 이상 접속`(`allow`), `정상 사건: allow`입니다. 거부·추가 확인되어야 할 결과는 `통과 · 미등록 기기의 가상 요청`(`deny`·`device_not_registered`), `통과 · 복합 이상 접속`과 `복합 이상 사건: step_up`입니다. 가상 요청 연습이며 심판 판정이 아닙니다.

5단계 서버 경유 메모 API를 확인합니다.

```powershell
npm.cmd run test:notes
```

정상 결과는 A/B가 서버 함수를 통해 각자 자기 메모를 추가·조회·수정·삭제하는 것입니다. 거부되어야 할 결과는 원본 API 직접 요청의 `401` 또는 `403`, 상대 메모 접근 `404`, 소유자 변경 `400`, 무로그인 자료 요청 `401`입니다. 새 커밋을 배포한 뒤 `/aleph.json`의 `allowedRoutes`와 첫 화면의 `X-Content-Type-Options: nosniff`도 확인합니다.

보너스 XDR을 다시 실행합니다.

```powershell
npm.cmd run xdr:run -- brute-force
```

정상 결과는 `result.json`의 `block` 10건·`alert` 9건·`record` 9건과 정상 이벤트 차단 0건입니다. 애매하거나 정상인 경보 주소가 `deny-rules.json`에 들어가면 안 됩니다. `alerts.log`는 실행할 때마다 새 알림 줄을 누적합니다.

```powershell
npm.cmd run xdr:run -- web-injection
node xdr/web-injection/respond.mjs
```

정상 결과는 `block` 8건·`alert` 9건·`record` 9건이고, wi-01~08 주소만 `deny`, 나머지는 `pass`입니다.
