# BYTE BACK 방어전 — 최부장 비밀 자료실(1~12단계)과 보안 Agent 「헤임달」(13~22단계·총공세)

> 최종 정리: 보안 Agent 「헤임달」의 완성 기록은 [`ALEPH_FINAL_WORK_RECORD.md`](ALEPH_FINAL_WORK_RECORD.md), 시연 순서·한계·근거는 [`on-client/docs/DEMO_AND_LIMITS.md`](on-client/docs/DEMO_AND_LIMITS.md), 처음 보는 사람용 실행 안내는 [`on-client/docs/RUN_GUIDE_ONE_PAGE.md`](on-client/docs/RUN_GUIDE_ONE_PAGE.md)에 있습니다. 아래 첫 문단과 「현재 작동」의 앞부분은 1~12단계 자료실 설명입니다.

브라우저의 가상 메모 읽기·추가·수정·삭제를 Vercel 서버 함수로만 처리합니다. 판정기는 등록 기기, 평소와 다른 복합 접속, 자원 구역별 정확한 경로를 차례로 확인하고, 자료 API도 검증된 사용자와 구역·소유자를 다시 대조합니다. 탐지 함수는 같은 사용자의 조회 폭주를 찾아 회수를 제안하고, 검증한 사본에서 정책과 메모 한 건을 되살립니다. 설치형 웹앱 화면과 패스키 기기 승인 흐름을 붙여 서버가 승인한 기기에서만 메모를 열고, 탈환 작전실에서 판정·탐지·회수·복구의 실제 결과를 읽는 12단계 자료실입니다. Supabase Auth 로그인과 서버의 토큰·소유자 검사는 유지하며, 원본 `public.notes`에 대한 PUBLIC·anon·authenticated 직접 권한은 회수합니다.

## 현재 작동

- `/`에서 Supabase Auth 로그인·로그아웃과 본인 가상 메모 CRUD 화면을 제공합니다.
- 화면은 `/api/notes`와 `/api/notes/:id`만 호출하고 원본 자료 API를 직접 호출하지 않습니다.
- 서버는 Bearer 토큰을 검증하고 확인된 사용자 ID와 `owner_id`가 같은 메모만 처리합니다.
- Auth용 Project URL과 publishable key 값은 정적 화면 코드에 두지 않고 서버 환경설정에서 전달합니다.
- 판정기(`src/decider.mjs`)는 `deviceRegistered`가 `true`인 기기의 내 메모 읽기만 허용하고, 미등록이거나 값이 없으면 `device_not_registered`로 거부합니다.
- 판정기는 엔진이 검증한 `judge_fixture` 신호에서 이상 시각·처음 보는 네트워크·대량 읽기가 모두 겹치면 `step_up`·`step_up_required`를 돌려줍니다. 다른 출처의 신호는 신뢰하지 않습니다.
- 자원은 `src/resources.mjs`에서 `notes.own`(내 메모)과 `notices.instructor`(강사 공지, 자료·API 없음)로 나뉩니다. 판정기 `resource_zone`은 자기 메모 한 건 읽기·수정만 허용하고, 여러 사람의 자료를 한꺼번에 여는 메모 전체 목록(`GET /notes`)과 공지 쓰기는 누구에게나 거부합니다. 강사 공지 수정은 `instructor_role_required`, 표에 없거나 쿼리가 붙은 경로는 `route_not_allowed`로 거부합니다.
- 자료 API는 응답에 `X-Resource-Id`를 붙이고, 검증된 로그인 종류·사용자 ID가 구역과 맞지 않으면 `403`으로 거부합니다. 소유자는 계속 `owner_id`로 확인하며 본문·쿼리의 `role`·`owner_id`는 믿지 않습니다.
- 탐지 함수(`src/detect.mjs`)는 가상 사건에서 가명 사용자·기기·요청 종류·판정·시각만 읽고, 같은 사용자의 `GET`이 10분 안에 120건을 넘을 때만 `propose_revocation`·`burst_read`를 돌려줍니다. `revocationProposal()`은 별도 결과로 대상 사용자와 확인된 기기 하나(없거나 섞이면 `null`)를 담은 회수 제안을 만듭니다.
- `npm run policy:diff`·`policy:restore`는 검증한 정책 사본과의 차이를 보여 주고 확인 번호를 거쳐서만 정책 파일을 되돌립니다. `POST /api/restore`는 비공개 사본 `notes_backup`에서 로그인한 본인의 메모 한 건만 ID·소유자·내용 해시를 대조해 복원하고 감사 기록을 덧붙입니다.
- 설치형 웹앱: `manifest.webmanifest`(앱 이름 `최부장 비밀 자료실`), 아이콘, 오프라인 안내(`offline.html`·`sw.js`, API 응답과 메모는 저장하지 않음). 설치 여부는 기기 확인이 아닙니다.
- 학생 로그인은 서버가 승인한 기기의 세션(`x-device-session`)이 있어야 메모·복원 API가 열립니다. 없으면 자료 조회 전에 `403 device_not_approved`입니다.
- 탈환 작전실(`GET /api/ops`, 로그인·승인 기기 필요)은 판정기·탐지를 서버에서 직접 실행한 결과, 내 기기 승인 상태와 복원 감사 기록(DB), 복구 기준 버전을 출처와 함께 보여 주고 운영 엔진 집행은 미실행으로 표시합니다. 메모 본문은 보여 주지 않고 기록 ID는 가립니다.
- 작전실의 "1~11단계 실측 재확인"은 정상·금지 요청을 실제로 보내 기대·실제 결과·요청 ID·확인 시각을 한 표로 남기고 JSON으로 내려받게 합니다. 41종 총공세처럼 실행하지 않은 시험은 미실행으로 남깁니다.
- `/data.json`은 정적 파일 대신 `api/data.js`가 빈 메모 목록(`notes: []`)으로 응답합니다(`vercel.json` rewrites). `/aleph.json`에는 배포 정보와 허용 경로를 기록합니다.
- 서버 요청 기록: `/api/notes`, `/api/notes/:id`, `/api/ops`, `/data.json`이 받은 요청마다 요청 ID(`x-request-id`, 없으면 서버가 만듦)·점검 이름(`x-aleph-attack-id`)·방법·경로·상태·소유자 키(비로그인은 없음)만 `access_log` 표에 남기고 응답 머리에 `X-Request-Id`를 붙입니다. 메모 본문·토큰은 남기지 않으며, 기록 저장이 실패해도 응답은 그대로 나갑니다. 작전실 「서버 요청 기록」 카드는 본인·비로그인 기록 최근 50건과 같은 목록에서 센 수치를 보여 주고, 표를 읽지 못하면 그 카드만 미실행으로 둡니다.
- 자기 점검(`src/attack-check.mjs`)은 묶음 실행 중 네트워크 요청을 보내지 않고 20건 모두 `not_run`으로 적습니다. 비로그인 거부·메모 0건 같은 실측은 배포 서버의 요청 기록과 작전실 실측 재확인 표에서 확인합니다.
- 보너스 XDR은 가상 Wazuh 무차별 로그인 경보를 `block`·`alert`·`record`로 나누고, `block` 주소만 15분 만료 거부 규칙 후보로 만듭니다.
- 보너스 XDR xdr-02는 가상 웹 주입 경보를 같은 세 단계로 나누고, 반복된 명확한 주입 시도의 주소만 15분 만료 거부 규칙 후보로 만듭니다.
- 보안 Agent 「헤임달」(`on-client/`, 시작 틀 0.2.21): 13~20단계 학생 화면(로그인·기기·세션, 업무 앱 판정, 기록 목록·상세, 알림·빈 상태·오류·도움정보, AI 연결 점검, AI 사건 설명, 보안 조치 상태, 설치 패키지·OSV 조회)을 `on-client/student/extension.mjs`에 구현했고, 총공세로 상태·패키지·기록 요약 카드, 「내 PC 측정 추이 비교」(CPU·메모리·디스크·네트워크·방화벽·Windows 기록 건수), SDP 미연결 구분, 「다시 조회」와 조회 실패 화면을 더했습니다. 실행 설명서와 구성도는 `on-client/docs/STUDENT_RUNBOOK.md`(21단계), 재현·릴리스 기록은 `on-client/docs/RELEASE_RECORD.md`(22단계)입니다. 22단계 뒤 총공세로 상태·패키지·기록 요약 카드와 「내 PC 측정 추이 비교」를 더했고, 핵심 기능 점검표는 `on-client/docs/CORE_FEATURES.md`입니다. 아래 「보안 Agent 「헤임달」」 절을 봅니다.

## 보안 Agent 「헤임달」 (13~22단계와 총공세, `on-client/`)

- **목적**: 회사 직원이 자기 로그인·기기·세션 상태, 업무 앱 접근 판정, 접속 기록·XDR 경보, AI 사건 설명, 보안 조치 진행 상태, 설치 패키지의 알려진 취약점, 내 PC의 CPU·메모리·디스크 추이를 한 화면에서 확인하는 로컬 보안 앱입니다. 성공·실패·확인 불가·예제를 글자로 구분하는 것이 목표입니다.
- **구성**: 브라우저(`public/` 제공 화면 + `student/extension.mjs` 학생 화면) → 로컬 앱 서버(`src/server.mjs`, `127.0.0.1:5189`) → 접근 제어·XDR 시스템(SDP host, 설정이 있을 때만) / ALEPH 포털(계정 연결) / 수업용 AI 게이트웨이 / OSV. 구성도와 데이터 흐름은 `on-client/docs/STUDENT_RUNBOOK.md` 4절에 있습니다.
- **지원 환경과 버전**: Windows PowerShell, Node.js 22~24(수업 기준 24.19.0, 학생 PC 실제 확인 v24.21.0), PC 브라우저(Chrome에서 확인). 시작 틀은 `on-client` 0.2.21이며(2026-10-28 갱신, 학생 파일 유지) 외부 npm 의존성이 없습니다. macOS·Linux 실행은 미확인입니다.
- **시연 순서·한계·근거(총공세 7일차)**: 핵심 기능 3가지 시연 순서, 아직 안 되거나 확인 불가로 남은 한계, 실제 화면·실행 기록·커밋 번호 근거는 `on-client/docs/DEMO_AND_LIMITS.md`에 있습니다.
- **실행 안내 한 장(총공세 5일차)**: 처음 보는 사람이 따라 하는 준비물·실행·첫 화면·종료·막혔을 때 표는 `on-client/docs/RUN_GUIDE_ONE_PAGE.md`에 있습니다.
- **실행 설명서(21단계)**: 설치·실행·종료·재실행, 오류별 확인 순서, 제공 코드와 학생 작성 부분, 미확인 기능은 `on-client/docs/STUDENT_RUNBOOK.md`에 정리했습니다.
- **재현·릴리스 기록(22단계)**: 최종 커밋을 새 폴더에서 받아 실행한 결과, 검증 중 버전인 이유와 미해결 사항, 데이터 보존 계획은 `on-client/docs/RELEASE_RECORD.md`에 있습니다. 22단계 통과는 원문 검토 기준의 수료이며 실제 운영 인증이 아닙니다. 이 기록의 재현 대상은 시작 틀 0.2.14 때의 `0a25836`이며, 0.2.21 갱신 뒤의 새 폴더 재현은 하지 않았습니다(미확인).
- **작전(총공세)**: 화면 틀은 관제 대시보드형(맨 위 상태 카드 네 개, 아래 추이와 기록), 포장 형태는 포장 없이 프로젝트 폴더에서 실행입니다. 0.2.21의 `npm run package-app`은 실행하지 않습니다.
- **AI 연결 상태(2026-10-28)**: 계정 연결은 성공했지만 AI 앱 승인은 포털에서 "다른 프로젝트가 이미 등록돼 있어 진행하지 않았습니다"로 거부됐고, 「AI 연결 점검」은 `ON_AI_PROVISIONING_PENDING`(운영 측 권한 준비 중)입니다. 담당자 확인을 기다리는 중이며, 「현재 API 연결 점검」·AI 사건 설명은 실제 화면에서 미확인입니다.

13단계부터 ALEPH 시작 틀 `alekov-starter-0.2.11`(0.2.14를 거쳐 현재 0.2.21로 갱신)의 `on-client/`(로컬 보안 Agent, 기본 이름 케셰브)에 학생 화면을 이어서 구현합니다. 학생 코드는 `on-client/student/extension.mjs` 하나이며, 제공 화면 `public/app.js`·서버 `src/`는 바꾸지 않습니다. 모든 화면은 `createElement`·`textContent`로 만들고, 상태는 색상뿐 아니라 글자와 원래 값(예: `unknown`)으로 구분합니다.

| 단계 | 함수 | 하는 일 | 커밋 |
|---|---|---|---|
| 13 | `renderIdentity` | 로그인 사용자·기기·세션을 불러오는 중·실패(연결 실패/확인 불가)·정상으로 나눠 표시, demo·disconnected 표시 | `394a0e5` |
| 14 | `renderDecision` | 업무 앱 접근 판정 allow·deny·challenge·unknown 구분, 요청 실패는 거부(deny)가 아님을 안내 | `2667109` |
| 15 | `renderEvents` | 접속 기록·XDR 경보 최신순 목록, 「기록 종류」·「업무 앱」·「접속 상태」 필터, 「<사건 ID> 상세」(근거·규칙·세 상태) | `a1a25cb` |
| 16 | `renderStatus`, 15단계 상세 | 기기·세션·도움정보의 불러오는 중·빈 목록·실패·시간 초과 구분, 알림별 자료·코드·내용, 「도움정보 복사」(여섯 항목만), 「<action> 미지원」 비활성 버튼 | `738cf16` |
| 17 | `renderAiConnection`, `renderExplanation` 기초 | AI 연결 점검 idle·loading·ok(test/verified)·error 구분, 오류 code별 원인, 연결 점검과 사건 설명 구분 | `78bf089` |
| 18 | `renderExplanation` | 사건 ID·AI 요약(참고용)·근거 "ID — 글"·규칙·확인 불가 상태·제안 미실행, 근거 불일치·`executed:true`는 쓸 수 없음 | `77cf7f5`, `702adbe` |
| 19 | `renderAction` | 조치 준비·사람 확인·서버 전달·접수(ACK)·효과 관측 구분, `effectApplied===true`일 때만 효과 확인 | `753f5e3` |
| 20 | `renderVulnerabilities` | 설치된 정확한 버전과 OSV 조회 결과, complete·partial·not_checked·not_configured·unverifiable 구분 | `9b134a1` |
| 21 | 문서 | 실행 설명서와 구성도 `on-client/docs/STUDENT_RUNBOOK.md` | `0a25836` |
| 22 | 문서 | 최종 커밋 새 폴더 재현 기록, 버전(검증 중 버전)·지원 범위, 설정 견본, 데이터 보존 계획 `on-client/docs/RELEASE_RECORD.md` | 재현 대상 `0a25836`, 기록 `c6aee05`, `cc373c1` |

22단계 뒤 총공세와 시작 틀 갱신:

| 구분 | 함수·파일 | 하는 일 | 커밋 |
|---|---|---|---|
| 총공세 1일차 A | `renderStatus` | 맨 위 상태 카드 네 개(연결·기기·세션·알림, 3일차부터 「연결」은 「SDP 서버 연결」)와 「다시 불러오기」마다 한 줄씩 쌓는 이번 실행 추이(최대 10줄). 실측·예제 자료(demo)·아직 값 없음을 글자로 구분 | `35625cf`, `5db9009`, `55a9b65` |
| 총공세 2순위 D | `renderVulnerabilities` | 조회 요약 카드 네 개(전체 조회 상태·패키지 수·취약점 수·조회 시각). 미조회·실패는 0개가 아니라 "조회 안 됨" | `24c3ce3` |
| 총공세 3순위 B | `renderEvents` | 기록 요약 카드 네 개(전체 기록·XDR 경보·접속 거부·가장 최근 기록 시각) | `d580e5d`, `1aeca24` |
| 총공세 1일차 | 문서 | 핵심 기능 세 가지 점검표 `on-client/docs/CORE_FEATURES.md` | `1a1c7c2` |
| 시작 틀 0.2.21 | 제공 파일만 | 제공 「내 PC 상태」(`/api/pc/status`), `package-app`, 수료용 내보내기 도구, AI 연결 진단 정보. `student/`와 학생 문서는 유지 | `555b07b` |
| 총공세 2일차 | `renderStatus`의 「내 PC 측정 추이 비교」 | 제공 `/api/pc/status` 실측(CPU 사용률·메모리 사용량·디스크 남은 공간)을 다시 구현하지 않고, 버튼을 누를 때만 읽어 최근 10회를 쌓고 직전 실측 대비 차이를 계산. 값마다 잰 시각·단위, 읽지 못한 값은 확인 불가와 이유. 학생 PC 실제 화면 확인 | `61d72f1`, `8ac4dd7` |
| 총공세 3일차 | `renderStatus` | 같은 제공 조회의 네트워크 구성·Windows 방화벽(읽기만)·System·Application 최근 24시간 경고·오류 건수(침해 탐지 아님) 카드와 직전 실측 대비. 권한 부족은 확인 불가와 이유. 상태 카드 「연결」을 「SDP 서버 연결」로 바꿔 SDP 미연결·확인 불가(이유)를 PC 조회 결과와 분리. 학생 PC 실제 화면 확인, 기록 건수는 이벤트 뷰어(지난 24시간)와 일치 | `d33fb53` |

- 다시 시도는 사용자가 위쪽 「다시 불러오기」를 직접 누를 때만 일어나며, 학생 코드는 자동 재요청을 하지 않습니다.
- 도움정보는 제공 화면이 조회해 넘겨 준 값에서 `requestId`·`component`·`version`·`checkedAt`·`engine.mode`·`engine.code`만 표시·복사합니다. 학생 코드는 `/api/diagnostics`를 직접 호출하지 않습니다.
- 미지원 조치 버튼은 `supportedActions`가 넘어온 경우에만 비활성으로 표시하며 어떤 요청도 보내지 않습니다. 예제 엔진의 기록은 `supportedActions`가 비어 있어 버튼이 나오지 않습니다.
- 세션은 지금 검증된 연결 하나만 표시하며 지난 세션 목록이 아닙니다.

실행(Windows PowerShell, `on-client` 폴더):

```powershell
npm.cmd run demo
```

브라우저에서 `http://127.0.0.1:5189`를 엽니다. 예제 자료(demo)는 실제 연결 결과가 아닙니다. 다만 「내 PC 상태」와 「내 PC 측정 추이 비교」의 값은 예제 모드에서도 이 PC 실측입니다. 연결 없음 상태로 실행하려면 `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1`을 씁니다. 중지는 터미널에서 Ctrl+C 뒤 `Y`입니다.

16단계 학생 확인(예제 모드 실제 화면): 「도움정보 복사」 결과가 여섯 줄뿐이고 비밀번호·토큰·API 키가 없음, 서버를 멈춘 뒤 「다시 불러오기」를 누르면 조회 실패 안내가 나오고 요청이 저절로 반복되지 않음, 서버를 다시 켜고 「다시 불러오기」를 누르면 실패 안내가 사라짐. 시간 초과·빈 목록·미지원 조치 버튼은 모의 데이터로만 점검했고, 회사 시스템 연결 상태는 미확인입니다. 위 내용은 학생의 실행·관찰이며 심판 판정이 아닙니다.

## 설치·실행·중지·복구 안내

기준 커밋은 12단계 심판 검사를 통과한 `882e5be`입니다(학생이 제출 화면에서 확인한 결과). 이 README 갱신 커밋은 코드 변경이 없습니다.

### 출처 구분

| 구분 | 맡는 일 | 위치 |
|---|---|---|
| 제공 엔진: **ALEPH SDP 엔진** (운영 측 제공, 이 저장소에 없음) | 신원·기기·경로 확인, 미등록 기기 릴레이 차단, 학생 판정기 `decide(request)` 호출(`aleph.decision.v1` 계약), 탐지 사건 전달과 회수 집행, 심판 토큰 발급 | `docs/DECIDER_REQUEST.md`가 설명하는 `student-kit/sdp-core/decision-contract.mjs`, `aleph.config.json`의 `judgeIssuer`(운영 측이 채움) |
| 시작 틀 (`ChoiTimo/aleph-defense-starter`, 초기 커밋 `241e44e`) | 제출 묶음, 판정기·탐지 연습 시험, 배포 정보 생성, 로그인 토큰 검증, 계약 문서, XDR 연습 사건 | `scripts/bundle.mjs`·`decider-test.mjs`·`detect-test.mjs`·`fixture-7.mjs`·`xdr-run.mjs`·`build-public.mjs`·`deployment-identity.mjs`, `src/verify-login.mjs`, `docs/`, `xdr/fixtures/`, `package/` |
| 학생 몫 | 판정기 규칙(`device_registered`·`step_up_required`·`resource_zone`), 탐지 규칙(`burst_read`)과 회수 제안, 자원 구역, 자료실 API, 정책·메모 복구, 접속 앱(설치형 화면·패스키 기기 승인), 탈환 작전실과 서버 요청 기록, 자기 점검, 시험 | `src/decider.mjs`·`detect.mjs`·`resources.mjs`·`device.mjs`·`device-flow.mjs`·`access-log.mjs`·`attack-check.mjs`, `api/notes.js`·`api/notes/[id].js`·`api/ops.js`·`api/data.js`·`api/restore.js`·`api/device/`, `public/`, `scripts/policy-*.mjs`, `policy/`, `xdr/brute-force/`·`xdr/web-injection/`, `test/` |

학생 판정기와 탐지 규칙은 ALEPH SDP 엔진이 부르는 함수입니다. 이 저장소만으로는 엔진의 실제 판정·회수 집행을 실행할 수 없으며, `npm run decider:test`·`detect:test`는 가상 요청 연습입니다.

### 설치 (재현 순서)

1. Node.js 22 이상을 준비하고 저장소를 받아 `npm ci`로 의존성을 설치합니다.
2. Supabase 학습 DB에서 `public.notes`의 PUBLIC·anon·authenticated 직접 권한이 회수돼 있는지 확인합니다(5단계 기록).
3. Supabase SQL Editor에서 `policy/restore-backup.sql`, `policy/device-approval.sql`, `policy/access-log.sql`을 차례로 실행해 사본·감사·기기·서버 요청 기록 표를 만듭니다. 파일 안의 주석 예시(사본 넣기, 기기 승인)는 필요할 때 따로 실행합니다.
4. Vercel 프로젝트에 이 저장소를 연결하고 **Settings → Environment Variables**에 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`의 값을 직접 넣습니다. 값은 저장소·README·제출 묶음에 적지 않습니다.
5. 새 주소로 배포했다면 `aleph.config.json`의 `publicAppUrl`을 그 주소로 맞춥니다. 패스키는 이 주소의 호스트 이름으로 만들어지므로 다르면 기기 승인이 실패합니다. `judgeIssuer`는 운영 측 값이라 바꾸지 않습니다.

### 실행

1. 로컬 시험: `npm.cmd run test:notes`, `test:restore`, `test:device`, `test:ops`, `test:access`, `decider:test`, `fixture:7`, `detect:test`, `xdr:test`, `policy:diff`
   - 알려진 실패(시작 틀 시험이라 고치지 않음): `test:r5`는 묶음이 쓰기 요청(POST·PUT·DELETE)을 보내길 기대하지만 12단계 심판 격리 환경은 GET·HEAD만 허용해 묶음이 요청을 보내지 않습니다. `test:package`는 시작 틀 함수 목록에 10~12단계에서 더한 `api/restore.js`·`api/device/`·`api/ops.js`·`api/data.js`가 없어 실패합니다.
2. 배포 화면: 로그인 → "이 기기 승인 요청" → SQL Editor에서 그 기기만 `approved = true` → "승인 확인하고 자료실 열기" → 메모 자료실과 탈환 작전실이 열립니다.
3. 작전실의 "1~11단계 실측 재확인"으로 정상·금지 요청의 실제 결과를 요청 ID·시각과 함께 표로 남깁니다.
4. 제출: `bundle-notes.json`(커밋하지 않음)에 설명 세 줄을 적고 `npm.cmd run bundle`을 실행합니다. 제출 화면의 「이번 단계에서 한 일」도 묶음 설명으로 쓰이므로 출처(ALEPH SDP 엔진·학생 몫)와 실측·미실행 구분을 적고 통과 주장 문구는 넣지 않습니다.
5. 제출 전 `https://choi-bujang-secret-vault-phi.vercel.app/aleph.json`의 `commit`이 제출할 커밋과 같은지(배포 완료) 확인합니다.

### 중지

- 한 기기의 접속 중지: SQL Editor에서 `update public.device_credentials set approved = false, approved_at = null where id = '<기기 ID>';` 다음 요청부터 그 기기의 세션이 `403`이 됩니다.
- 로그인 세션 중지: 로그아웃하거나 화면을 닫습니다. 세션은 메모리에만 있어 새로고침하면 사라집니다.
- 서비스 전체: Vercel 프로젝트의 **Deployments**에서 이전 정상 배포로 되돌립니다(Instant Rollback). 학습 DB 자료와 감사 기록은 지우지 않습니다.
- 엔진 쪽 판정·회수는 ALEPH SDP 엔진(운영 측)이 맡으며 학생이 중지하지 않습니다.

### 복구

1. 정책 파일: `npm.cmd run policy:diff`로 검증 사본과의 차이를 보고, `npm.cmd run policy:restore`의 미리보기와 확인 번호를 확인한 뒤 `-- --apply --confirm=<확인 번호>`로 되돌립니다. 기록은 `policy/restore-audit.log`에 덧붙습니다.
2. 코드 되돌리기: 문제 커밋만 `git revert <커밋>`으로 되돌리고 `git reset --hard`는 쓰지 않습니다.
3. 메모 한 건: `notes_backup`에 검증된 사본이 있으면 `POST /api/restore`로 그 한 건만 되돌립니다. 모든 시도는 `notes_restore_audit`에 남습니다.
4. 복구 뒤 재확인: 작전실 실측 재확인 표와 「서버 요청 기록」 카드로 1~11단계 정상·금지 결과를 다시 봅니다. `npm.cmd run bundle`의 자기 점검은 요청을 보내지 않으므로 모두 `not_run`입니다.

## 보너스 XDR xdr-01

`xdr/fixtures/brute-force.json`의 수업용 경보를 읽어 MITRE ATT&CK T1110 기반 패턴과 비교합니다. 명확한 공격만 `xdr/brute-force/deny-rules.json`에 만료 시각·근거 경보 번호와 함께 기록하고, `block`·`alert` 알림은 `xdr/alerts.log`에 JSON 한 줄씩 누적합니다. 정상 이벤트와 애매한 경보는 거부 규칙에 넣지 않습니다.

이 기능은 로컬 가상 경보 연습입니다. 운영 Wazuh 사건 전달, 검증된 출발 주소 전달, 실제 ZTNA 차단 집행은 연결됐다고 표시하지 않습니다. 기존 `src/decider.mjs` 규칙은 변경하지 않았습니다.

`connect.mjs`에 `decideWithTemporaryDeny` 연결 함수를 추가했습니다. 검증된 출발 주소와 운영 등록 정책을 별도로 받으며, 차단하지 않은 요청은 기존 판정기로 전달합니다. 실제 운영 호출부와 출발 주소 계약은 현재 자료실에 없어 연결을 완료하지 않았습니다. 필요한 항목은 `docs/XDR_INTEGRATION.md`에 정리했습니다.

`npm.cmd run xdr:test`로 원본 분류, 문구 변형, 차단 규칙·알림, 만료 해제와 기존 판정기 응답 보존을 확인합니다. 정상 허용은 시험용 판정기로 확인하며, 실제 시작 판정기의 `starter.deny`는 유지됩니다.

## 보너스 XDR xdr-02

`xdr/fixtures/web-injection.json`의 수업용 경보를 MITRE ATT&CK T1190 기반 패턴 4개(SQL 구문·스크립트 태그·경로 거슬러 올라가기·명령 구분자, `xdr/web-injection/patterns.json`)와 비교합니다. `decide.mjs`는 import·파일 읽기·외부 호출 없이 판단만 하며, 같은 주소에서 5회 이상 반복된 주입 시도만 `block`입니다. `respond.mjs`가 `block` 주소만 `xdr/web-injection/deny-rules.json`에 만료 시각·근거 경보 번호와 함께 넣고 `block`·`alert` 알림을 `xdr/alerts.log`에 쌓습니다. 실행기(`npm run xdr:run`)는 `connect.mjs`만 부르므로 규칙·알림 갱신은 `node xdr/web-injection/respond.mjs`로 합니다. 운영 엔진 연결과 기존 `src/decider.mjs` 규칙은 xdr-01과 같이 바꾸지 않았습니다.

## 보너스 XDR xdr-03

`xdr/fixtures/known-cve.json`의 수업용 경보를 CVE-2021-44228(NVD)·MITRE ATT&CK T1190 기반 패턴 3개(머리글 안의 원격 조회 구문·인자 안의 원격 조회 구문·점검 흔적과 조회 구문의 결합, `xdr/known-cve/patterns.json`)와 비교합니다. `decide.mjs`는 import·파일 읽기·외부 호출 없이 판단만 하며, 요청 값에 완전한 `${jndi:<프로토콜>://…}` 구문이 있을 때만 `block`(확신도 0.85 이상), CVE 번호·`jndi` 낱말·잘린 조각처럼 관련 흔적만 있으면 `alert`, 나머지는 `record`입니다. `respond.mjs`가 `block` 주소만 `xdr/known-cve/deny-rules.json`에 15분 만료·근거 경보 번호와 함께 넣고(정상 이벤트가 나온 주소는 제외) `block`·`alert` 알림을 `xdr/alerts.log`에 쌓습니다. 조회 구문은 문서용 표기이며 알림·규칙에 남기지 않습니다. `read-alerts.mjs`는 시각·주소·계정·수준·설명만 뽑는 확인용입니다.

확인: `npm.cmd run xdr:run -- known-cve`(결과 `block 8 · alert 8 · record 8`), `node xdr/known-cve/respond.mjs`(거부 규칙 7개, kc-01~08 주소만 `deny`). 가상 경보 연습이며 운영 엔진 연결과 기존 `src/decider.mjs` 규칙은 바꾸지 않았습니다.

## 보너스 XDR xdr-04

`xdr/fixtures/persistence.json`의 수업용 서비스·예약 작업·파일 변경 경보를 MITRE ATT&CK T1543·T1053·T1547.001 기반 패턴 3개(서명 없는 새 서비스 등록, 낯선 예약 작업, 평소 목록에 없는 시작 폴더 프로그램, `xdr/persistence/patterns.json`)와 비교합니다. `decide.mjs`는 import·파일 읽기·외부 호출 없이 판단만 하며, 서비스·예약 작업·시작 폴더 경보가 뚜렷한 신호(서명 없음·임시 폴더·평소 목록에 없음·재부팅 뒤 남음·임의 이름·수업 시간 밖·실행 파일 변경·반복·시작 폴더 위치) 둘 이상과 맞고 수업 중·`C:\lab`·서명 미확인 같은 사정이 없을 때만 `block`입니다. 신호가 약하면 `alert`, 서명된 기존 항목·평소 일정·읽기만 한 경우는 `record`입니다. `respond.mjs`가 `block` 주소만 `xdr/persistence/deny-rules.json`에 15분 만료·근거 경보 번호와 함께 넣고(계정이 아니라 출발 주소 기준, 정상 이벤트가 나온 주소 제외) `block`·`alert` 알림을 `xdr/alerts.log`에 쌓습니다. 실행 파일 경로는 알림에 남기지 않습니다.

확인: `npm.cmd run xdr:run -- persistence`(결과 `block 8 · alert 8 · record 8`, 정상 ps-17~24 모두 `record`), `node xdr/persistence/respond.mjs`(거부 규칙 7개, ps-01~08 주소만 `deny`). 시작 폴더만 바뀐 ps-03은 T1547.001 패턴으로 `block`이고, 수업 도구 시작 항목(ps-10)·실행 기록 없는 시작 폴더 변경(ps-14)은 `alert`입니다. 가상 경보 연습이며 운영 엔진 연결과 기존 `src/decider.mjs` 규칙은 바꾸지 않았습니다.

## 보너스 XDR xdr-05

`xdr/fixtures/privilege.json`의 수업용 계정·그룹 변경과 관리자 권한 사용 경보(26건)를 MITRE ATT&CK T1078·T1068 기반 패턴 3개(평범한 계정의 관리자 그룹 추가, 처음 보는 관리자 명령 실행, 업무 시간 밖·처음 보는 주소의 권한 사용, `xdr/privilege/patterns.json`)와 비교합니다. `decide.mjs`는 import·파일 읽기·외부 호출 없이 판단만 하며, 뚜렷한 신호(관리자 그룹 추가·관리자 명령·방금 바뀐 관리자 세션·다른 계정 권한·업무 시간 밖·처음 보는 주소·여러 계정·재가입) 둘 이상이 맞고 수업 중·취소·평소 주소·한 번·실패 같은 사정이 없을 때만 `block`입니다. 신호가 약하면 `alert`, 로그인·읽기만·수업용 관리 계정의 평소 로그인은 `record`입니다. `respond.mjs`가 `block` 주소만 `xdr/privilege/deny-rules.json`에 15분 만료·근거 경보 번호·세션을 거둘 대상 계정과 함께 넣고(계정 전체가 아니라 출발 주소 단위, 정상 이벤트가 나온 주소 제외) `block`·`alert` 알림을 `xdr/alerts.log`에 쌓습니다. 그룹 이름과 설명 문장은 알림에 남기지 않습니다.

확인: `npm.cmd run xdr:run -- privilege`(결과 `block 9 · alert 8 · record 9`, 정상 pv-18~26 모두 `record`), `node xdr/privilege/respond.mjs`(거부 규칙 8개, pv-01~09 주소만 `deny`). 판정기 계약에는 출발 IP와 Wazuh 계정 이름을 가명 `subjectId`로 잇는 값이 없어 실제 세션 회수는 미연결이며, 기존 `src/decider.mjs` 규칙은 바꾸지 않았습니다.

## 보너스 XDR xdr-06

`xdr/fixtures/exfiltration.json`의 수업용 외부 전송 경보(30건)를 MITRE ATT&CK T1048·T1041 기반 패턴 3개(처음 보는 목적지로 대용량 전송, 명령 통로로 같은 목적지에 반복 전송, 업무 시간 밖 압축 파일 반출, `xdr/exfiltration/patterns.json`)와 비교합니다. `decide.mjs`는 import·파일 읽기·외부 호출 없이 판단만 하며, 큰 전송(50MB 이상)에 처음 보는 목적지·많은 파일(50건 이상)·반복(5회 이상)·업무 시간 밖·압축·명령 통로·평소 안 쓰는 포트 같은 신호가 겹치고 1건·실패·전송 없음·백업처럼 보임·평소 목적지 같은 사정이 없을 때만 `block`입니다. 작거나 사정이 있으면 `alert`, 자료실의 작은 읽기·저장은 `record`입니다. `respond.mjs`는 출발 주소가 아니라 **목적지**를 막습니다. `block` 경보의 목적지만 `xdr/exfiltration/deny-rules.json`(`target: destination`)에 15분 만료·근거 경보 번호와 함께 넣고, 정상 이벤트가 향한 목적지(자료실 등)는 넣지 않으며, `block`·`alert` 알림을 `xdr/alerts.log`에 쌓습니다. 판정기 연결은 같은 파일의 `decideWithDestinationDeny`(엔진이 확인한 목적지만 검사하고 나머지는 기존 판정기로 넘김)입니다.

확인: `npm.cmd run xdr:run -- exfiltration`(결과 `block 10 · alert 10 · record 10`, 정상 ex-21~30 모두 `record`), `node xdr/exfiltration/respond.mjs`(목적지 거부 규칙 8개, ex-01~10 목적지만 `deny`). 판정기 계약에 목적지 주소가 없어 실제 차단은 미연결이며, 기존 `src/decider.mjs` 규칙은 바꾸지 않았습니다.

## 11단계 접속 앱과 기기 승인

- 서비스·경로: `POST /api/device/register`(이 기기를 승인 대기로 등록), `POST /api/device/verify`(패스키 서명 검증 뒤 승인된 기기에만 30분 기기 세션). 두 경로는 `allowedRoutes`에 더하지 않고 여기에만 적습니다.
- 기기 개인키는 기기의 패스키 인증기 안에만 있고, 서버(`device_credentials`)에는 공개키와 승인 여부만 둡니다. 기기 세션 원문은 응답으로 한 번만 주고 DB(`device_sessions`)에는 SHA-256 지문만 저장합니다. 화면은 기기 세션을 메모리에만 두고 브라우저 저장소에 넣지 않습니다.
- 화면의 "이 기기 승인 요청" 버튼은 승인 대기로만 등록합니다. 승인은 학생이 Supabase SQL Editor에서 `device_credentials.approved`를 바꿔서 합니다(`policy/device-approval.sql`). 승인을 거두면 다음 요청부터 그 기기의 세션이 거부됩니다.
- 심판 로그인은 기기 세션 검사를 받지 않습니다. 심판 토큰에 기기 정보가 없어 이전 단계 확인을 막지 않기 위해서입니다.
- 로그인 세션도 브라우저 저장소에 쓰지 않습니다. 화면의 Supabase 로그인은 `persistSession: false`로 세션을 메모리에만 두며, 새로고침하거나 앱을 다시 열면 다시 로그인합니다(Chromium 확인: 이전 설정은 `sb-...-auth-token`을 `localStorage`에 썼고, 수정 뒤에는 아무것도 쓰지 않음).
- 메모·복원 API 파일이 바뀌어 `policy:diff`는 9단계 검증 정책 대비 `api/notes.js`·`api/notes/[id].js`를 의도한 차이로 보여 줍니다.

로컬 확인(2026-10-13): `npm.cmd run test:device` 5건 통과. 승인 전 메모 `403`(메모 조회 안 함), 승인 요청만으로는 세션 없음, DB에서 승인한 기기만 세션을 받아 메모 `200`, 다른 사용자·승인 취소·만료·서명 실패 `403`. 기존 `test:notes`·`test:restore`는 승인된 기기 조건으로 통과했습니다. 가상 자료 연습이며 심판 판정이 아닙니다.

학생 확인(2026-10-13, 배포 화면·학습 DB, 시험 계정 B): 로그인 직후 메모 영역 없음·`서버 승인: 미확인` → "이 기기 승인 요청" 뒤 `승인 대기` → 승인 전 "승인 확인"은 `승인 대기`로 메모 열리지 않음 → SQL Editor에서 그 기기만 `approved = true` → "승인 확인" 뒤 `승인됨`·기존 메모 목록·추가·수정 정상 → 승인을 거두자 다음 요청에서 `미승인`으로 메모 영역 닫힘. 확인 뒤 다시 승인해 두었습니다. 심판 판정이 아닙니다.

## 10단계 백업에서 되살리기

### 정책 복원

- `npm.cmd run policy:diff`: 침해 전 검증한 정책 사본(`policy/verified-policy.json`, 9단계 저장점 `4093403`)을 지문으로 검증한 뒤 현재 정책과의 차이만 보여 줍니다. 사본이 없거나 검증에 실패하면 중단합니다.
- `npm.cmd run policy:restore`: 바뀔 항목과 확인 번호를 먼저 보여 주고, `-- --apply --confirm=<확인 번호>`로 다시 실행할 때만 사본 목록의 정책 파일을 되돌립니다. `aleph.config.json`은 정책 항목(`identityProvider`·`allowedRoutes`·`originalApiUrl`)만 되돌리고, 다른 파일과 설정은 보존합니다. 기록은 `policy/restore-audit.log`에 덧붙이기만 합니다.

### 메모 한 건 복원

- 서비스: Vercel 서버 함수 `api/restore.js`
- 경로: `POST /api/restore`, 본문 `{ "id": "<메모 UUID>" }` 하나만 받습니다. 로그인(Bearer)이 필요합니다.
- 비공개 사본 표 `notes_backup`에서 검증된 로그인 사용자의 그 ID 한 건만 찾고, ID·소유자·내용 해시(제목 + 줄바꿈 + 본문의 SHA-256)를 대조한 뒤 그 한 건만 씁니다. 다시 읽어 같은지 확인하고, 응답에는 내용 없이 `id`·`restored`·`contentSha256`만 돌려줍니다.
- 다른 메모와 다른 사용자의 같은 ID 메모는 건드리지 않습니다. 감사 기록 표 `notes_restore_audit`에는 로그인이 검증된 모든 복원 시도를 성공·실패와 상관없이 메모 ID·소유자·결과(`restored`·`unchanged`·`backup_not_found`·`backup_verification_failed` 등)·복원 전후 해시만으로 덧붙입니다. 감사 기록을 쓰지 못하면 성공 응답을 주지 않습니다.
- 사본 표와 감사 표는 `policy/restore-backup.sql`을 Supabase SQL Editor에서 학생이 직접 실행해 만듭니다. 두 표 모두 anon·authenticated 권한이 없고, 감사 표는 수정·삭제 권한이 없습니다.

로컬 확인(2026-10-13): `npm.cmd run test:restore` 6건 통과. 거부된 시도(`backup_not_found`, `backup_verification_failed`)와 이미 같은 메모(`unchanged`)도 감사 기록에 남고, 감사 기록 쓰기가 실패하면 `500`입니다. 시험 계정 B의 가상 메모 한 건이 사본과 같은 ID·소유자·내용 해시로 복원되고, B의 다른 메모와 A 메모는 그대로, 감사 기록은 덧붙기만 했습니다. B의 A 메모 복원 `404`, 본문 추가 필드 `400`, 사본 해시 불일치 `409`, 무로그인 `401`. 가상 자료 연습이며 심판 판정이 아닙니다.

학생 확인(2026-10-13, 배포 경로·학습 DB): `policy/restore-backup.sql`로 사본·감사 표를 만들고 시험 계정 B의 메모 한 건을 사본으로 떴습니다. 화면에서 제목을 바꾼 뒤 B가 `POST /api/restore`를 보내 `200`·`restored: true`를 받았고, 제목이 원래대로 돌아왔습니다. SQL 대조에서 `same_owner`·`same_hash`가 모두 `true`, `audit_rows`는 1이었습니다. A로 같은 메모 복원을 요청하면 `404 backup_not_found`였습니다. 심판 판정이 아닙니다.

### 복구 뒤 1~9단계 재확인 순서

복구(정책 복원 → 메모 한 건 복원)를 마친 뒤 아래 순서로 다시 실행합니다. 결과 칸은 실제로 실행하고 본 값만 적고, 실행하지 않은 시험은 미실행으로 둡니다. 판정기·탐지 시험은 가상 요청 연습이며 심판 판정이 아닙니다.

1. 정책이 돌아왔는지: `npm.cmd run policy:diff` → `사본 검증: 통과`, `요약: 사본과 차이가 없습니다.`
2. 자료가 돌아왔는지: Supabase SQL Editor에서 내용 없이 해시만 비교합니다.
   ```sql
   select b.id, n.owner_id = b.owner_id as same_owner,
          encode(sha256(convert_to(n.title || E'\n' || n.content, 'UTF8')), 'hex') = b.content_sha256 as same_hash
   from public.notes_backup b left join public.notes n on n.id = b.id;
   select count(*) as audit_rows from public.notes_restore_audit;
   ```
   복원한 메모는 `same_owner`·`same_hash`가 모두 `true`, `audit_rows`는 복원 횟수만큼 늘어나야 합니다.
3. DB 직접 권한(5단계): 같은 SQL Editor에서 `public.notes`의 권한을 조회합니다. anon·authenticated는 SELECT·INSERT·UPDATE·DELETE가 모두 `false`, service_role은 모두 `true`여야 합니다.
4. 로컬 시험: `npm.cmd run test:notes`, `npm.cmd run test:restore`, `npm.cmd run test:r5`, `npm.cmd run decider:test`, `npm.cmd run fixture:7`, `npm.cmd run detect:test`, `npm.cmd run xdr:test`
5. 배포 점검: `npm.cmd run bundle` 뒤 `artifacts\submission.json`의 `attackAttempts`를 봅니다(PC에서 실행해야 배포 주소에 닿습니다).
6. 화면 확인: A로 로그인해 메모 목록과 `/api/notes` 응답 헤더 `X-Resource-Id: notes.own`을 보고, B로 로그인한 Console에서 A 메모 ID를 직접 요청합니다.

| 단계 | 확인 방법 | 정상 요청 결과 | 거부되어야 할 요청 결과 | 복구 뒤 결과 |
|---|---|---|---|---|
| 1~2 공개 자료 정리 | 5번 `static_notes_removed` | `/data.json` `200`, 메모 0건 | 공개 파일에 메모가 보이면 실패 | 학생 PC 묶음: `/data.json` `200`·메모 0건 |
| 3 로그인 | 5번 `anonymous_notes_*`, 4번 `test:notes` | 로그인한 A의 목록·추가·수정·삭제 성공 | 무로그인 목록·추가·조회·수정·삭제 `401` | 학생 PC 묶음: 무로그인 목록·추가·조회·수정·삭제·복원 모두 `401`. 로컬 `test:notes` 5건 통과 |
| 4 소유자 검사 | 6번, 4번 `test:notes` | A 자기 메모 `200` | B의 A 메모 읽기·수정·삭제 `404`, 소유자 변경 `400` | 학생 확인: 다른 계정의 메모 복원 `404`. 로컬 `test:notes`에서 상대 메모 `404`·소유자 변경 `400`. 배포 화면의 상대 메모 직접 조회는 복구 뒤 다시 하지 않음 |
| 5 서버 경유·DB 권한 | 3번, 5번 `direct_original_notes` | 서버 함수 경유 CRUD 성공 | 원본 API 직접 요청 `401`·`403`, anon·authenticated 권한 `false` | 학생 PC 묶음: 원본 API 직접 GET `401`. 학생 확인: 3번 `public.notes` 권한 조회 정상(anon·authenticated `false`, service_role `true`) |
| 6 등록 기기 | 4번 `decider:test` | 등록 기기 읽기 `allow` | 미등록 기기 `deny`·`device_not_registered` | 로컬 `decider:test` 통과: 등록 `allow`, 미등록 `deny`·`device_not_registered` |
| 7 재확인 | 4번 `decider:test`, `fixture:7` | 정상 사건·재인증한 사건 `allow` | 복합 이상 사건 `step_up`·`step_up_required` | 로컬 `decider:test`·`fixture:7` 통과: 정상·재인증 `allow`, 복합 이상 `step_up` |
| 8 자원 구역 | 4번 `test:notes`, 5번 `own_note_zone` 등, 6번 | 메모 한 건 읽기·수정 `allow`, 화면 목록 `200` | 메모 전체 목록·공지 쓰기·알 수 없는 경로 `deny`, 구역이 맞지 않는 로그인 `403` | 묶음 점검: 자기 메모 수정 `allow`, 학생 공지 수정 `deny`·`instructor_role_required`, 기능 경로 `deny`·`route_not_allowed`. 화면 메모 목록은 학생이 B 로그인으로 확인 |
| 9 탐지·회수 제안 | 4번 `detect:test` | 정상 조회 `observe` | 10분 안 121건 이상 `propose_revocation`·`burst_read` | 로컬 `detect:test` 6건 통과: 정상 `observe`, 폭주 `propose_revocation`·`burst_read` |
| 10 복원 | 1번, 2번, 4번 `test:restore` | 대상 한 건 ID·소유자·해시가 사본과 같음 | B의 A 메모 복원 `404`, 사본 해시 불일치 `409` | 학생 확인(2026-10-13): B 메모 한 건 복원 `200`·`restored: true`, 제목 원래대로, `same_owner`·`same_hash` 모두 `true`, `audit_rows` 1, A의 B 메모 복원 `404 backup_not_found`, 비로그인 복원 `401`. 사본 해시 불일치 `409`는 로컬 시험만 |

복구 뒤 결과의 출처(2026-10-13): "학생 PC 묶음"은 학생이 PC에서 `npm.cmd run bundle`로 배포 주소에 실제로 보낸 요청의 결과입니다. "로컬"은 `5a90be1`에서 다시 실행한 시험이며, 판정기·탐지 시험은 가상 요청 연습입니다. 정책 사본은 `npm.cmd run policy:diff`로 다시 읽어 `사본 검증: 통과`였고, `allowedRoutes`는 9단계 검증 정책과 같게 되돌려 차이가 없습니다. 학습 DB의 정책 복원(`policy:restore` 적용)은 되돌릴 차이가 없어 실행하지 않았습니다.

재인증 전 실제 자료 차단(7단계)과 운영 엔진의 실제 회수·경과 시간(9단계)은 제공 엔진이 저장소에 없어 복구 뒤에도 미실행이며 심판이 확인합니다.

## 9단계 탐지와 회수 제안

- 계약(`docs/DETECT_EVENTS.md`)의 사건 값 `at`·`method`·`identity.sub`만 탐지 근거로 씁니다. 메모 내용·토큰·실명은 읽어 들이지 않습니다. 지역·네트워크는 사건 계약에 없어 근거로 쓰지 않습니다.
- 정확히 120건, 다른 사용자끼리의 합산, 10분 밖의 조회, `GET`이 아닌 요청은 세지 않습니다. 여러 사용자가 넘으면 가장 먼저 넘은 사용자 하나를 제안합니다.
- 회수 제안은 제안 객체만 만듭니다. 회수 API 호출, 기기 권한 변경, 판정기 응답 형식 변경은 하지 않았습니다.

로컬 확인(2026-10-13): `npm.cmd run detect:test` 6건 통과, 정상 30건 `observe`·제안 없음, 폭주 121건 이상 `propose_revocation`·`burst_read`. 운영 반 엔진의 사건 전달·실제 회수·경과 시간 측정은 미실행이며 심판이 확인합니다. 가상 사건 연습이며 심판 판정이 아닙니다.

## 8단계 자원 구역

- 판정기는 엔진이 확인한 `subjectId`·`deviceId`·`method`·`route`·`path`·`service`가 서로 맞고 `queryLength`가 0일 때만 구역 규칙을 적용합니다. `:id` 자리에는 자료 ID 한 칸만 받습니다.
- 판정기는 가명 `subjectId`로 메모 주인을 알 수 없습니다. B가 A 메모를 여는 요청은 자료 API가 `owner_id` 조건으로 `404`를 돌려 막습니다.
- 강사 권한을 저장한 자료가 없고 판정 계약에 역할 항목이 없어, 강사 공지 수정은 누구에게도 허용하지 않습니다.

로컬 확인(2026-10-13): 판정기는 메모 한 건 읽기·수정 `allow`, 메모 전체 목록 `GET /notes`와 공지 `POST`·`PUT`·`PATCH`·`DELETE` `deny`. 자료 API는 A 자기 메모 목록·읽기·수정 `200`, 심판 a/b 신원을 다른 소유자로 구분, B의 A 메모 읽기·수정 `404`, 쿼리 `owner_id` 위조 시 메모 0건, 본문 `role` 섞인 수정 `400`, 알 수 없는 로그인 종류 `403`, 학생 공지 수정 `deny`·`instructor_role_required`. 가상 요청 연습이며 심판 판정이 아닙니다.

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
- 허용 경로: `GET|POST /api/notes`, `GET|PUT|DELETE /api/notes/:id` (9단계 검증 정책과 같음)
- 복원 경로(`restoreRoute`): `POST /api/restore` (허용 경로 목록은 바꾸지 않고 이 칸에만 적음)
- 단계: `12`
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

12단계 탈환 작전실을 확인합니다.

```powershell
npm.cmd run test:ops
npm.cmd run test:access
```

정상 결과는 작전실 6건, 서버 요청 기록 4건 통과입니다. 배포 화면에서는 기기 승인 뒤 작전실 카드의 수치가 함께 표시된 가린 기록 목록과 맞고, 「서버 요청 기록」에 비로그인 요청이 요청 ID와 함께 보이며, "1~11단계 실측 재확인"의 상태 줄이 `불일치 0건`이어야 합니다. 거부되어야 할 결과는 비로그인 `GET /api/ops` `401`, 기기 세션 없는 학생 요청 `403`입니다. `npm.cmd run bundle`의 자기 점검은 20건 모두 `not_run`이어야 합니다.

11단계 기기 승인 흐름을 확인합니다.

```powershell
npm.cmd run test:device
```

정상 결과는 5건 통과입니다. 배포 화면에서는 로그인 뒤 "이 기기 승인 요청" → SQL Editor에서 승인 → "승인 확인하고 자료실 열기" 순서로 메모가 열려야 합니다. 거부되어야 할 결과는 승인 전 메모 영역 없음, 승인 전 메모 API `403 device_not_approved`, 비로그인 기기 경로 `401`입니다.

10단계 정책 비교와 메모 한 건 복원을 확인합니다.

```powershell
npm.cmd run policy:diff
npm.cmd run test:restore
```

정상 결과는 `사본 검증: 통과`와 복원 시험 6건 통과입니다. 거부되어야 할 결과는 사본이 없거나 위조됐을 때 `정책 비교 중단`, B의 A 메모 복원 `404`, 사본 해시 불일치 `409`입니다. 복원 경로는 `restoreRoute`에만 적고 `allowedRoutes`는 9단계 검증 정책 그대로 둡니다. 11단계부터 `policy:diff`는 기기 세션 검사를 더한 `api/notes.js`·`api/notes/[id].js`만 의도한 차이로 보여 줍니다.

9단계 탐지 함수를 확인합니다.

```powershell
npm.cmd run detect:test
```

정상 결과는 `통과 · 정상 조회 30건`, `통과 · 10분 안에 120건`, `통과 · 서로 다른 사용자 각 100건`, `통과 · 10분 밖으로 흩어진 조회 200건`(모두 `observe`)입니다. 회수 제안이 나와야 할 결과는 `통과 · 10분 안에 121건`, `통과 · 폭주 조회 200건`입니다. 가상 사건 연습이며 실제 접속 회수나 심판 판정이 아닙니다.

6·7·8단계 판정기를 확인합니다.

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
