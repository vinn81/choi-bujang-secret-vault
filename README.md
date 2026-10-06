# BYTE BACK 방어전 2단계 — 자료를 코드 밖으로 옮깁니다

이 저장소는 1단계에서 공개했던 가상 메모 네 건을 학습용 Supabase `notes` 테이블로 옮기고, Vercel 서버 함수로 읽는 2단계 자료실입니다. 실제 학생 자료, 비밀번호, 토큰, 서버 전용 키를 코드와 Git에 넣지 않습니다.

## 현재 작동

- `/`는 `/api/notes`를 호출해 가상 메모 네 건을 카드로 표시합니다.
- `/api/notes`는 `api/notes.js`에서 Supabase `notes` 테이블을 읽습니다.
- `/data.json`의 `notes`는 빈 배열이며, 빌드도 공개 메모를 복사하지 않습니다.
- `owner_id`는 나중에 사용할 `uuid` 칸으로만 두었고 `auth.users` 외래키는 걸지 않았습니다.
- `notes`는 RLS를 켜고 `anon`·`authenticated`를 차단하며, 서버의 `service_role`에만 조회 권한을 줍니다.

## Vercel 서버 환경변수

Vercel 프로젝트의 **Settings → Environment Variables**에서 다음 이름을 등록합니다.

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

값은 Vercel의 비밀 입력란에만 직접 넣습니다. 코드, 브라우저 파일, API 응답, 로그, Git, 제출 묶음에 값을 넣지 않습니다.

## 아직 남은 약점

자료와 서버 전용 키는 정적 파일과 브라우저에서 빼냈지만, 2단계의 `/api/notes`는 아직 로그인을 검사하지 않는 공개 주소입니다. 주소를 아는 누구나 가상 메모를 요청할 수 있으며, 인증과 사용자별 접근 제어는 다음 단계에서 추가해야 합니다.

또한 현재 파일에서 메모를 제거해도 이전 Git 커밋과 이전 Vercel 배포 이력은 자동으로 삭제되지 않습니다. 예전 공개 커밋과 배포가 남아 있는 한 과거 노출이 해소됐다고 보고하지 않습니다.

## 공개 파일 검색 절차

GitHub 최신 `main`의 모든 추적 파일에서 네 가상 메모 문장을 검색합니다. `git fetch`는 원격 조회 정보만 갱신하며 작업 파일을 바꾸지 않습니다.

```powershell
$memoPattern = '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록'
git fetch origin main
git grep -n -E $memoPattern origin/main -- .
```

출력이 없어야 GitHub 최신 추적 파일에 해당 문장이 없는 것입니다. 파일명과 줄이 나오면 제거되지 않은 공개 본문이 있는 것입니다.

현재 Vercel 정적 응답 `/`과 `/data.json`에서도 같은 문장을 검색합니다. `/api/notes`는 DB에서 읽은 가상 메모를 의도적으로 반환하므로 이 정적 파일 검색 대상에서 분리합니다.

```powershell
$deploymentBase = 'https://choi-bujang-secret-vault-phi.vercel.app'
$memoPattern = '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록'
foreach ($path in @('/', '/data.json')) {
  $body = & curl.exe --silent --show-error --fail ($deploymentBase + $path)
  $count = [regex]::Matches($body, $memoPattern).Count
  '{0}: memo sentence matches={1}' -f $path, $count
}
```

두 경로 모두 `memo sentence matches=0`이어야 현재 정적 배포 파일에 메모 문장이 없는 것입니다.

공개 API의 남은 약점은 본문을 출력하지 않고 비로그인 HTTP 상태만 확인합니다.

```powershell
curl.exe --silent --output NUL --write-out 'HTTP %{http_code}' ($deploymentBase + '/api/notes')
```

로그인 없이 `HTTP 200`이면 2단계의 공개 API 약점이 남아 있는 것입니다. 이는 이번 단계의 의도된 관찰 결과이지만, 보호 완료나 심판 판정으로 기록하지 않습니다.

## 확인 기록

2026-10-06 2단계 커밋·재배포 전 익명 요청 기준입니다.

- GitHub 최신 `data.json`: HTTP 200, 메모 문장 4건, `notes` 4건
- GitHub 최신 `public/data.json`: HTTP 200, 메모 문장 4건, `notes` 4건
- 현재 Vercel `/`: HTTP 200, 정적 HTML의 메모 문장 0건
- 현재 Vercel `/data.json`: HTTP 200, 메모 문장 4건, `notes` 4건
- 현재 Vercel `/api/notes`: HTTP 404, 2단계 함수 미배포
- 판정: 2단계 변경이 아직 원격에 반영되지 않았으므로 과거 노출은 해소되지 않았으며, 새로운 배포 후 위 절차를 다시 실행해야 합니다.
- 공개 API 약점: 2단계 배포 후 `/api/notes`가 비로그인 `HTTP 200`을 반환하면 약점이 남은 것으로 기록합니다.

## 다시 확인하기

로컬에서 정적 결과물이 메모를 포함하지 않는지 확인할 때는 다음을 실행합니다.

```powershell
npm.cmd run build -- --local
```

로컬 빌드는 Vercel 배포나 심판 판정을 증명하지 않습니다. 배포 후 `/`에서 카드 네 건, `/data.json`에서 빈 `notes`, `/api/notes`에서 공개 가상 메모 응답을 각각 확인합니다. 심판의 접수·판정은 포털에서 확인합니다.
