# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 5단계: 자료 요청을 서버 한곳으로 (현재 단계)

현재 단계는 5단계입니다(`aleph.config.json`의 `step: 5`).

작동하는 기능
- 브라우저는 Supabase에 직접 붙지 않습니다. 화면 코드에는 Supabase 키와 SDK가 없고, 로그인은 `POST /api/auth/login`, 토큰 갱신은 `POST /api/auth/refresh`, 메모는 `/api/notes`로만 요청합니다. 로그아웃은 브라우저에 저장된 토큰을 지우는 것입니다.
- 서버 함수는 로그인 검사와 소유자 검사를 4단계와 똑같이 합니다.
- `db/direct-access-revoke.sql`: 메모 테이블의 `PUBLIC`·`anon`·`authenticated` 직접 권한을 모두 회수하고 `service_role`만 남깁니다. 적용 전후 권한을 `has_table_privilege`로 대조합니다. 다른 테이블은 건드리지 않습니다.
- 원본 자료 API 주소(쿼리 없음)는 `aleph.config.json`의 `originalApiUrl`에 있고, 허용 경로는 `allowedRoutes`이며 빌드가 `/aleph.json`에도 싣습니다.

환경변수(이름만 적습니다. 값은 Vercel의 비밀 입력란에만 넣습니다)
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`: 메모 API (2~4단계와 같음)
- `SUPABASE_PUBLISHABLE_KEY`: 로그인·갱신 서버 함수 전용. 화면 코드에는 두지 않습니다.

다시 실행하는 방법
1. Vercel 환경변수에 위 세 개를 넣고 다시 배포합니다.
2. 배포가 정상인 것을 화면에서 확인한 뒤 SQL Editor에서 `db/direct-access-revoke.sql`을 실행하고, 앞뒤 권한 표를 비교합니다.
3. 자동 시험: `npm run test:notes`, `npm run test:r5`, `npm run test:auth`.

남은 약점
- 로그인 토큰을 브라우저 `localStorage`에 보관하므로, 화면에 스크립트가 주입되면 토큰이 노출될 수 있습니다. 화면은 사용자 입력을 `textContent`로만 넣어 막고 있습니다.
- 로그인 시도 횟수 제한은 아직 없습니다.
- 옛 공개 커밋·배포 이력의 과거 노출은 여전히 해소되지 않았습니다.

## 4단계: 로그인해도 내 자료만 보이게 (지난 단계)


작동하는 기능
- 메모 읽기·추가·수정·삭제는 서버가 확인한 사용자 ID와 DB의 `owner_id`가 같을 때만 됩니다. URL이나 본문의 `owner_id`는 믿지 않고, 추가할 때는 확인된 ID로 저장합니다.
- 남의 메모를 읽거나 고치거나 지우려 하면 404로 답해 존재 여부도 알려 주지 않습니다. 수정에서 소유자를 바꾸려 하면 403으로 거부합니다. DB 쿼리도 `id`와 `owner_id`를 함께 걸어 한 번에 처리합니다.
- `db/memos-rls.sql`: `defense_memos`의 기존 권한을 회수하고 `authenticated`에 SELECT·INSERT·UPDATE·DELETE만 주며, RLS 정책으로 `auth.uid() = owner_id`인 행만 허용합니다. `anon`에는 권한이 없습니다. 앱 서버는 `service_role`로 접속하므로 소유자 검사는 서버 코드가 맡고, RLS는 직접 접근에 대한 두 번째 방어선입니다.
- 가상 메모의 소유자 연결은 커밋하지 않는 `db/owners.local.sql`로 합니다(계정 이메일이 들어 있습니다).

다시 실행하는 방법
1. `db/memos.sql`(3단계) 다음에 `db/memos-rls.sql`을 SQL Editor에서 실행하고, 끝의 권한 대조 결과를 확인합니다.
2. Authentication에 A, B 시험 계정을 만든 뒤 로컬의 `db/owners.local.sql`을 실행합니다.
3. 자동 시험: `npm run test:notes`, `npm run test:r5`.

남은 약점
- 기본 접근 제어는 서버 코드와 RLS가 같은 규칙을 따로 구현한 것이라, 한쪽만 고치면 어긋날 수 있습니다.
- 심판이 재현할 수 없는 `authenticated` 역할의 직접 Data API 접근은 이 저장소에서 직접 시험하지 않았습니다.
- 옛 공개 커밋·배포 이력의 과거 노출은 여전히 해소되지 않았습니다.

## 3단계: 진짜 로그인 (지난 단계)

3단계 설명입니다. 소유자 검사 부분은 4단계에서 바뀌었습니다.

작동하는 기능
- 화면(`/`)은 Supabase Auth 이메일·비밀번호로 로그인과 로그아웃을 하고, 로그인한 뒤에만 메모를 보여 줍니다. 로그인 실패 이유는 화면에 나옵니다. 화면에는 공개용 Project URL과 publishable key만 있습니다.
- 서버 API는 요청의 `Authorization: Bearer` 토큰을 `src/verify-login.mjs`로 검사합니다. 토큰이 없거나 위조·만료·다른 서비스용이면 401과 JSON 오류(`LOGIN_REQUIRED`)로 거부합니다. 브라우저가 보낸 사용자 ID나 역할은 믿지 않습니다.
- 경로: `GET·POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`. 목록은 로그인한 사용자의 메모만 돌려주고, 추가할 때 서버가 확인한 사용자 ID를 `owner_id`로 저장합니다. 허용 경로는 `aleph.config.json`의 `allowedRoutes`에 있습니다.
- 메모는 `db/memos.sql`로 만든 `defense_memos` 테이블에 있습니다(RLS 켜짐, `anon`·`authenticated` 권한 회수).

다시 실행하는 방법
1. Supabase SQL Editor에서 `db/memos.sql`을 실행합니다.
2. Supabase Authentication에서 테스트 계정을 만듭니다. 비밀번호는 저장소에 적지 않습니다.
3. Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`는 2단계와 같습니다(값은 저장소에 없음).
4. 자동 시험: `npm run test:notes`, `npm run test:r5`.

남은 약점
- (4단계에서 해결됨) 당시 `/api/notes/:id`는 소유자를 검사하지 않았습니다.
- 옛 공개 커밋·배포 이력의 과거 노출은 여전히 해소되지 않았습니다.

## 2단계: 자료를 코드 밖으로 옮김 (지난 단계)

- 가상 메모 네 건은 Supabase의 `defense_notes` 테이블에 있습니다. 테이블 정의는 `db/notes.sql`(RLS 켜짐, `anon`·`authenticated` 권한 회수)이고, 메모 본문 입력문은 커밋하지 않는 `db/seed.local.sql`에만 있습니다.
- 화면은 `api/notes.js` 서버 함수(`/api/notes`)로 메모를 읽습니다. 함수는 Vercel 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 읽고, 키는 코드·응답·로그에 넣지 않습니다.
- `data.json`과 `public/data.json`에는 메모를 남기지 않습니다. 확인 표시(`sampleMarker`)와 빈 `notes`만 있습니다.
- **남은 약점**: `/api/notes`에는 아직 로그인 검사가 없어서 누구나 호출해 가상 메모를 읽을 수 있습니다. 3단계에서 막습니다.
- **과거 노출은 해소되지 않았습니다.** 1단계에서 공개된 옛 커밋과 옛 배포 주소에는 메모가 남아 있을 수 있습니다. 옛 공개 커밋과 옛 배포가 남아 있는 한 과거 노출이 해소됐다고 쓰지 않습니다.

### 현재 작동하는 기능과 다시 실행하는 방법

현재 단계는 2단계입니다(`aleph.config.json`의 `step: 2`).

작동하는 기능
- `/`: 서버 API로 가상 메모 네 건을 읽어 카드로 보여 줍니다.
- `/api/notes`: 서버 전용 키로 Supabase `defense_notes`를 읽어 돌려줍니다. 로그인 검사는 아직 없습니다.
- `/data.json`: 메모 없이 빈 `notes`만 있습니다.
- `/aleph.json`: 빌드가 Vercel의 저장소·커밋·배포 주소를 읽어 만듭니다.

다시 실행하는 방법
1. Supabase SQL Editor에서 `db/notes.sql`을 실행해 테이블, RLS, 권한을 만듭니다.
2. 같은 곳에서 가상 메모를 넣습니다. 입력문은 커밋하지 않는 `db/seed.local.sql`에 있습니다.
3. Vercel 환경변수에 이름만 맞춰 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 넣습니다. 값은 저장소에 적지 않습니다.
4. 로컬에서 화면 파일만 확인하려면 `npm run build -- --local`을 실행합니다. 이것은 배포를 증명하지 않습니다.
5. 자동 시험은 `npm run test:r5`로 실행합니다.

### 2단계 확인 절차

현재 배포 파일과 GitHub 최신 파일에 가상 메모 문장이 없는지 직접 검색합니다. 검색할 문장은 `db/seed.local.sql`(커밋 제외 파일)의 메모 문구 한 줄입니다.

1. 저장소 최신 파일: 로컬에서 `git grep -n "<메모 문장>"`을 실행합니다. 결과가 없어야 합니다. (`db/seed.local.sql`은 `.gitignore`로 제외되어 있어 추적되지 않습니다.)
2. 배포된 정적 파일: 시크릿 창이나 `curl`로 `/data.json`을 엽니다. `notes`가 비어 있어야 합니다. `/`의 HTML 원본에도 메모 문장이 없어야 합니다.
3. 화면: `/`에서 네 카드가 보여야 합니다. 카드는 정적 파일이 아니라 `/api/notes` 응답으로 그려집니다.
4. 공개 API: 비로그인으로 `/api/notes`를 호출합니다. 지금은 가상 메모가 응답됩니다. 이것이 3단계 전까지 남는 약점입니다.

검색 결과와 `/api/notes`의 남은 약점은 각각 따로 기록합니다. 옛 커밋(`git log -p`)과 이전 배포 주소는 이 검색 범위에 들어 있지 않습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
