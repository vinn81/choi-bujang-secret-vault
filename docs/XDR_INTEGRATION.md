# XDR 연결 상태와 운영 엔진 요구사항

2026-10-08 기준입니다.

## 구현과 시험 완료

- `xdr/brute-force/decide.mjs`: 원본 경보 28건과 문구·횟수·수준 변형을 분류합니다.
- `xdr/brute-force/connect.mjs`: 차단 후보에 15분 만료와 근거 경보 번호를 붙이고 알림을 누적합니다.
- 같은 연결 모듈의 `decideWithTemporaryDeny`: 엔진이 확인한 별도 출발 주소를 검사합니다. 유효한 차단 규칙이면 운영 측이 제공한 거부 응답을 반환하고, 나머지는 기존 판정 함수를 그대로 호출합니다.
- 응답은 기존 5개 항목을 지키고, 운영 측이 전달한 허용 이유 코드와 규칙 ID 목록에 있는 거부 응답만 반환합니다.
- 차단되지 않은 정상·애매한 주소의 요청, 만료 시각에 도달한 주소의 요청은 기존 판정기로 넘깁니다. 기존 판정기의 거부를 허용으로 바꾸지 않습니다.

## 운영 연결이 아직 완료되지 않은 이유

`docs/DECIDER_REQUEST.md`의 18개 요청 항목에는 출발 IP가 없습니다. `request.signals`에도 검증된 IP는 없으며, 현재 실제 신호는 `none` 또는 `unknown`입니다. ZIP에는 운영 엔진이 `src/decider.mjs`를 호출하는 서버 코드와 허용 코드 등록부도 없습니다.

따라서 `src/decider.mjs`에 임의 IP 필드나 임의 허용 규칙을 추가하지 않았습니다. 기존 `starter.deny`는 유지됩니다. 정상 주소를 XDR 검사에서 통과시켰다고 해서 기존 판정기에서 요청이 허용됐다는 의미는 아닙니다.

## 운영 측에서 제공해야 할 사항

1. 판정기를 호출하는 서버 코드와 그 서버가 검증한 출발 IP를 얻는 방법
2. XDR 거부에 사용하도록 등록된 `reasonCode`와 규칙 ID
3. 실제 정상 요청을 허용하는 기존 정책과 운영 경보 전달 방식

연결 함수는 다음 인자를 사용합니다.

| 인자 | 출처 |
|---|---|
| `request` | 현재 18개 항목 계약의 검증된 요청 |
| `trustedSourceAddress` | 운영 엔진이 확인한 IP. 브라우저 본문이나 미검증 헤더에서 추출하지 않음 |
| `rulesDocument` | 기존 `loadDenyRules(root)`로 읽은 규칙 문서 |
| `decide` | 기존 판정 함수 |
| `denyResponse` | 운영 등록 정책에 맞는 거부 응답을 만드는 함수 |
| `allowedReasonCodes`, `allowedRuleIds` | 운영 등록부의 허용 목록 |
| `at` | 서버가 확인한 현재 시각. 생략하면 서버 현재 시각 |

운영 호출부가 위 값을 제공해야 실제 연결이 됩니다. 이 파일 자체는 운영 엔진을 수정하거나 배포하지 않습니다.

## 로컬 확인

VS Code PowerShell에서 저장소 루트 기준으로 실행합니다.

```powershell
npm.cmd run xdr:test
npm.cmd run xdr:run -- brute-force
(Get-Content '.\xdr\brute-force\result.json' -Raw -Encoding UTF8 | ConvertFrom-Json).counts
```

예상 분류는 block 10, alert 9, record 9입니다. 시험은 원본 분류, 추출 건수, 문구 변형, 규칙 만료·근거, 알림, 기존 응답 보존, 미검증 주소와 미등록 코드 거부를 확인합니다. 정상 허용 응답은 시험용 대체 판정기로 확인하며, 실제 운영 요청 허용이나 심판 통과의 증거가 아닙니다. Jev 실서비스 응답은 검증하지 않았습니다.

## 근거

| 내용 | 저장소 내 출처 | 기준 연도 |
|---|---|---|
| 실제 요청·응답 계약과 등록 코드 요구 | `docs/DECIDER_REQUEST.md` | 2026 |
| 기존 시작 판정기가 모두 거부함 | `src/decider.mjs` | 2026 |
| 명확·애매·정상 경보 | `xdr/fixtures/brute-force.json` | 2026 |
| 판정자가 경보를 재실행함 | `xdr/README.md` | 2026 |
| 연결과 만료 동작의 시험 | `test/xdr-brute-force.test.mjs` | 2026 |
