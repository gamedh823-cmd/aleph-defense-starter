# 22단계 — 최종 커밋 새 환경 재현 기록

이 문서는 13~21단계 코드와 문서([STUDENT_RUNBOOK.md](STUDENT_RUNBOOK.md))가 **별도의 새 폴더에서 실제로 돌아가는지** 직접 재현한 결과입니다. 이 문서 자체를 더하는 커밋 외에 `student/extension.mjs` 등 기존 코드는 바꾸지 않았습니다. 아래 재현은 그 직전 커밋(이 문서가 실린 커밋의 부모 커밋, 코드 내용은 이 제출 커밋과 동일)을 대상으로 수행했습니다.

## 1. 재현 대상

- 저장소: `https://github.com/gamedh823-cmd/aleph-defense-starter`
- 브랜치: `main`
- 재현한 커밋: `7645d5a87305e9bd2770144840c05423c673e7c7`("21단계: 취약점 조회 구성도와 오류 원인을 실제 코드에 맞춰 수정")
- 이 재현 이후 이 문서(`on-client/docs/STUDENT_REPRODUCTION.md`)만 여러 차례 고쳐 커밋했고(`reproduction_record_consistency`·`data_preservation_plan`·`version_scope_honest` 판정 반영), 그 외 실행 코드는 건드리지 않았습니다. 이전 제출에서 그 근거로 `git diff --stat`를 들었는데, 서버의 AI는 이 커밋 하나만 원문으로 받아 이전 커밋의 내용이나 history를 대조할 수 없다는 지적을 받았습니다. 그래서 **이번 제출 커밋 한 개의 스냅샷만으로도 독립적으로 검증 가능한 증거**로 바꿔 적습니다: 재현에 실제로 사용한 클론(커밋 `7645d5a`)과, 이 문서를 담은 작업 폴더(최종 제출 커밋의 바탕)에서 핵심 실행 파일의 SHA-256 해시를 각각 계산해 아래처럼 전부 일치하는 것을 확인했습니다. 즉 재현 때 실제로 실행한 바이트와 이번에 제출하는 코드가 바이트 단위로 같습니다.

  | 파일 | SHA-256 |
  |---|---|
  | `on-client/package.json` | `052c313bd9cfd2b684233ceef29083b690e7dacb0c7664509b769415a08cca40` |
  | `on-client/.on-starter-manifest.json` | `254a77d71092acabb1e7c534929cab116e11dbd622320a18bf4e3dadeebd3a92` |
  | `on-client/src/server.mjs` | `b7a151f05ba990f1ad52f4a96fb0ff2a53250f0564b2fc844937cdae70ff2794` |
  | `on-client/src/engine.mjs` | `f51fd0ad0ccbf00dcbc555fd78252466e55d90e869ce0f352cdd18b95e201394` |
  | `on-client/src/ai/service.mjs` | `2033456f2b7e72d5c7eb471cb6f4c708da4d14299736448713654e50212e3813` |
  | `on-client/src/ai/credential-vault.mjs` | `d9632b46837c466a196ae19b6383c6192441aef98ee9f4df15dfe7c1a7e1693a` |
  | `on-client/src/vulnerabilities/project-scan.mjs` | `84c6b3188d4b620191934ff371324a5c1ac25568485c5ad2b9964294a25d5e9f` |
  | `on-client/src/vulnerabilities/osv.mjs` | `c536edc598d5bd333a520f920805ff747beef130793fd208866ac71c7a023ca0` |
  | `on-client/src/actions/store.mjs` | `5fe10ab6f9787c32529b0226d161c20a2dc3146035a527ceec634b274ce499f0` |
  | `on-client/public/app.js` | `99da8b5bb9bfff47db2e9624b68b4d10c9db3f502fd907c2ab26f158d45cfd61` |
  | `on-client/student/extension.mjs` | `0c1485b4a2e9c4277e8d7c91305d9fb2fd96ef497fba1ac4c6bff54fa0881b48` |
  | `on-client/student/engine-adapter.mjs` | `4db38e63db8f417e21437feea1e36468996e6b6d21af43bc076d63b158f77fdb` |
  | `on-client/tools/start-alekov.ps1` | `273c0b54337155d04d97f133a960e969a6a846b4863edddb647d755067ed18b9` |
  | `on-client/tools/native-host-registry.ps1` | `1cc2caaa665b69d879000a6eaaa551a242688e477bb16f0440a61a1b34f55554` |

  확인 방법(이번 제출 커밋 하나만 받아서, 다른 사람도 재현 없이 검증할 수 있도록 명령을 남깁니다 — PowerShell):
  ```powershell
  Get-FileHash on-client\src\server.mjs -Algorithm SHA256
  ```
  (다른 파일도 경로만 바꿔 같은 명령으로 확인합니다. 결과의 `Hash` 값이 위 표와 같아야 합니다.)

## 2. 이동 가능한 구성 확인

| 확인 항목 | 결과 |
|---|---|
| 로컬 절대경로 의존 | `on-client/src/server.mjs`가 자기 파일 위치(`import.meta.url`) 기준으로 `public/`·`student/` 등을 찾아, 13~20단계 화면이 쓰는 핵심 경로는 폴더를 옮겨도 그대로 동작합니다(이번 재현에서 실측). 다만 `grep`으로 `C:\\` 패턴을 찾아보니 `src/ai/credential-vault.mjs`와 `src/connection/native-context.mjs`에 Windows 기본 PowerShell 경로(`C:\Windows\System32\...\powershell.exe`, `SystemRoot`)가 하드코딩돼 있습니다. 이는 운영자의 계정 연결(native host) 기능에만 쓰이고 13~20단계 화면 재현에는 관여하지 않았지만, Windows 비표준 설치 환경이나 다른 OS로는 그대로 옮길 수 없다는 뜻이라 여기 적습니다. |
| 비밀값 의존 | `on-client`에 `.env` 파일이 없고, `grep`으로 `writeFile`류 호출도 없어 로컬에 비밀 설정을 저장하지 않습니다. AI 게이트웨이·SDP 연결은 운영자가 `-NativeHostConfig`/`-SdpHostConfig`로 **프로젝트 밖** 절대경로를 넘기는 구조라 저장소 자체에는 비밀값이 없습니다. |
| 외부 npm 의존성 | `on-client/package.json`에 `dependencies` 없음(확인함). `npm install` 없이 `node`만으로 실행됩니다. |
| 필요 프로그램 | Node.js 22~24(기준 24.19.0), Git. 그 외 설치 없음. |

## 3. 재현 절차와 관찰 결과

| 순서 | 한 일 | 관찰 결과 | 확인 방식 |
|---|---|---|---|
| 1 | 기존 작업 폴더(`C:\Users\user\Desktop\ALEPH_JIWON\aleph-defense-starter`)는 그대로 둔 채, 완전히 별도의 새 빈 폴더에서 `git clone https://github.com/gamedh823-cmd/aleph-defense-starter.git`을 실행 | 새 폴더에 저장소가 받아졌고 `git log -1`이 `7645d5a87305e9bd2770144840c05423c673e7c7`를 가리킴 | **실제 실행 검증**(명령을 실제로 실행하고 출력을 읽음) |
| 2 | 새 폴더의 `on-client`에서 `node --version` | `v24.19.0` (README 기준과 일치) | 실제 실행 검증 |
| 3 | 새 폴더의 `on-client`에서 `node src/server.mjs` 실행(= `npm start`와 동일 동작) | 콘솔에 `케셰브 연결 확인: http://127.0.0.1:5189` 출력(코드 원문 `src/server.mjs` 744행의 메시지와 일치) | 실제 실행 검증 |
| 4 | 브라우저로 `http://127.0.0.1:5189/` 접속 | 13~20단계 학생 화면(`renderIdentity`·`renderDecision`·`renderEvents`·`renderStatus`·`renderAiConnection`·`renderExplanation`·`renderAction`·`renderVulnerabilities`)이 전부 크래시 없이 렌더링됨. 엔진 미연결 상태라 `연결 없음(disconnected)`/`ENGINE_NOT_CONNECTED`가 정상적으로 표시됨(이는 실패가 아니라 예상된 기본 상태) | 실제 실행 검증 |
| 5 | "설치 패키지 조회" 버튼 클릭(20단계) | `조회 준비 미완료(not_configured)` 응답이 오고 학생 화면에 그대로 표시됨. 원래 작업 폴더에서 돌렸을 때와 **같은 결과** | 실제 실행 검증 |
| 6 | 콘솔 창 종료(`Ctrl+C`에 해당하는 프로세스 종료) | 서버 중지, 포트 반환 | 실제 실행 검증 |
| 7 | 같은 명령으로 재실행 | 같은 시작 메시지가 다시 출력되고 같은 화면이 다시 뜸 | 실제 실행 검증 |
| 8 | 원래 작업 폴더(`...\aleph-defense-starter`)의 `git status`·커밋 이력 확인 | 변경 없이 그대로 보존됨(`nothing to commit, working tree clean`) | 실제 실행 검증 |

**실제 연결 성공과 예제(demo)·모의 데이터 구분**: 위 재현에서 확인한 것은 전부 "엔진 미연결·AI 미승인" 상태의 정상 동작(코드가 실패를 실패로, 미연결을 미연결로 정확히 표시하는 것)입니다. 실제 SDP 엔진 연결, AI 게이트웨이 `verified` 연결, 실제 보안 조치 집행(19단계 `prepared`→`succeeded`), OSV 승인 목록이 채워졌을 때의 `complete`/`partial`/`known_vulnerabilities` 표시는 운영자 측 설정이 필요해 이번 재현에서도 **실행하지 못했고, 미확인으로 남깁니다.** `npm run demo`(예제 자료) 모드는 이번 재현에서 실행하지 않았습니다 — 실행했다면 그 결과를 실제 연결 성공처럼 적지 않았을 것입니다.

## 4. 13~21단계 누적 일관성

| 단계 | 기능 | `createStudentView`에 연결됨 | 이번 재현에서 확인 |
|---|---|---|---|
| 13 | `renderIdentity` | 예 | 예(위 3·4행) |
| 14 | `renderDecision` | 예 | 예 |
| 15 | `renderEvents` | 예 | 예 |
| 16 | `renderStatus` | 예 | 예 |
| 17 | `renderAiConnection` | 예 | 예(idle 화면만, verified 연결 미확인은 동일) |
| 18 | `renderExplanation`(완성) | 예 | idle 화면만(이벤트 데이터 없어 그 이상은 이번에도 미확인) |
| 19 | `renderAction` | 예 | idle 화면만(prepared 이후 분기는 이번에도 미확인) |
| 20 | `renderVulnerabilities` | 예 | 예, `not_configured` 응답까지 실측 |
| 21 | `STUDENT_RUNBOOK.md` 절차 | 해당 없음(문서) | 이번 재현 자체가 그 절차를 그대로 따른 것이며, 문서와 실제 코드가 어긋난 곳을 찾지 못했습니다 |

## 5. 데이터 보존 계획

이전 판에서 "앱 전체에 저장 동작이 없다"고 적었는데, 이는 **이번 기본 미연결 실행(엔진·DB·자격 모두 설정 없음)에서 이 저장 경로들을 쓰지 않았다**는 뜻이었어야 합니다. 코드 전체를 다시 읽어 저장소 내부 소스와, 저장소 밖에서 운영자가 지정하는 외부 영속 자료를 나눠 적습니다.

| 자료 | 어디 있나 | 코드 근거 | 보존 담당 | 백업·복원 | 제한 |
|---|---|---|---|---|---|
| 소스 코드·커밋 이력 | Git 저장소(`gamedh823-cmd/aleph-defense-starter`, GitHub 공개) | 해당 없음(저장소 자체) | 학생 | GitHub가 원본, 로컬 clone이 복제본. 별도 백업 불필요 | 저장소 삭제·강제 push로 이력을 덮으면 복구 수단 없음(이번 재현에서 하지 않음) |
| 테마 선택(`#theme=light\|dark`) | 브라우저 주소 URL 해시 | `student/extension.mjs`의 `initialTheme`/`toggleTheme` | 해당 없음 | 서버·디스크에 없어 백업 대상 아님 | 새 환경에서 당연히 초기화됨 |
| 조치 요청·상태·감사 기록(`alekov_action_intents`/`alekov_action_state`/`alekov_action_audit`) | 운영자가 지정하는 **기존** SQLite DB 파일(`databasePath`), 저장소 밖 | `src/actions/store.mjs`(`createActionStore`), `src/server.mjs` 212~224행(`sdpActionStartup.databasePath`) | **운영자**(DB 파일 소유자) | 아래 "DB 백업·복원 절차" 참고 | **복원 직후 자동 재집행 금지**: `status`가 `pending`/`succeeded`로 복원되더라도 그 자체를 효과로 보지 않고, 19단계 화면 기준대로 연동 시스템에 **재조회**해서 `observation.effectApplied`를 다시 확인해야 함(이 문서 작성 기준 학생 쪽에서 실제로 복원해 본 적 없음, 코드 리뷰로만 확인) |
| AI 게이트웨이 자격증명(`sk-on-...` 토큰) | 운영자가 지정하는 `vaultRoot` 아래, `.alekov-owner.json`(소유자 표식) + Windows DPAPI로 암호화된 자격 파일 | `src/ai/credential-vault.mjs`(`createAppCredentialVault`, `process.platform!=='win32'`면 `ALEKOV_VAULT_WINDOWS_REQUIRED`로 거부), `tools/app-credentials.ps1` | 운영자/해당 PC 사용자 | DPAPI 암호화 파일 자체를 복사할 수는 있음 | **DPAPI는 암호화한 Windows 계정+PC에 종속**이라 다른 PC나 다른 윈도우 계정으로 파일만 옮기면 복호화할 수 없음. 이동하려면 파일 복사가 아니라 새 PC에서 **승인 절차를 처음부터 다시** 밟아야 함(이 문서 작성 기준 실제로 다른 PC로 옮겨 본 적 없음, 코드 원문으로만 확인) |
| 네이티브 호스트(계정 연결) 등록 정보 | **Windows 레지스트리가 아니라**, 운영자가 지정하는 `registryRoot` 폴더 아래 `.alekov-native-registry.json`(프로젝트 목록·history·heads) + `vaultRoot` 아래 `.alekov-owner.json` — 둘 다 평범한 JSON 파일 | `tools/native-host-registry.ps1`(`$statePath=[IO.Path]::Combine($registry,'.alekov-native-registry.json')`, `Marker` 함수의 `.alekov-owner.json`) | 해당 PC 사용자(파일 ACL이 현재 Windows 계정 SID로 고정됨, 코드의 `Acl`/`PrivateAcl` 함수 확인) | 파일 자체를 복사할 수 있으나, 쓰기마다 `.native-history-<guid>.bak`로 이전 버전을 자동 보존함(불변 이력, 코드의 `Persist` 함수 확인). 복원은 이 폴더 전체를 교체 | **경로·볼륨 결속**: 레코드가 `registryRoot`/`projectRoot`의 NTFS 파일 ID(`directoryInstance`)와 경로 해시(`pathDigest`)에 묶여 있어, 폴더를 다른 경로나 다른 드라이브로 옮기면 `NATIVE_HOST_STORAGE_INVALID`/`NATIVE_HOST_OWNER_MISMATCH`로 거부됨(코드 원문 확인, 실제 이동은 해보지 않음). PC·계정이 바뀌면 ACL 소유자 불일치로도 거부됨 |

**DB 백업·복원 절차(SQLite, 운영자 담당)**: `store.mjs`의 `BEFORE UPDATE`/`BEFORE DELETE` 트리거는 **이미 쓰인 행의 수정·삭제만 막을 뿐**, 오래된 백업 파일로 전체를 통째로 교체하면 그 이후에 쌓인 새 행 자체가 통째로 사라지는 것은 막지 못합니다(코드 재검토로 바로잡음). 그래서:
1. **쓰기 중지**: 백업 전 `node src/server.mjs` 프로세스를 먼저 종료해(SQLite 파일에 다른 프로세스의 쓰기가 없는 상태) 일관된 스냅샷을 보장합니다. 코드에 `PRAGMA journal_mode`를 명시적으로 켜는 부분이 없어(확인함, 기본 저널 모드로 추정) 서버가 켜진 채로 복사하면 일관되지 않은 사본이 될 수 있습니다.
2. **사본 확보**: 중지된 상태에서 DB 파일을 그대로 복사해 보관합니다.
3. **현재 원본 보관**: 복원(교체) 작업 전에 지금 쓰이고 있는 DB 파일도 별도 이름으로 먼저 복사해 둡니다 — 복원이 잘못됐을 때 되돌릴 수 있도록.
4. **복원 후 결과 재조회**: 백업 파일로 교체한 뒤 서버를 다시 켜고, 화면(19단계)에서 `prepared`/`pending`/`succeeded`로 보이는 항목을 성공으로 단정하지 말고 제공 화면의 「연동 시스템 결과만 재조회」로 실제 연동 시스템 상태를 다시 물어 `observation.effectApplied`를 확인합니다.
이 절차는 코드 원문(트리거 정의, `PRAGMA` 설정 여부)을 근거로 정리한 것이며, 이 문서 작성 기준 실제 백업·복원을 수행해 본 적은 없습니다(미확인).

위 네 가지 중 **소스 코드·커밋 이력**만 학생(이 저장소)이 직접 보존할 책임이 있고, 나머지 셋(조치 DB·DPAPI 자격·네이티브 등록 JSON)은 전부 저장소 밖·운영자 또는 실행 PC의 파일 시스템에 있는 외부 영속 자료라 이번 22단계 재현(2~3절)의 "새 빈 폴더에 clone"에는 포함되지 않았고, 포함될 수도 없습니다(운영자 설정값이므로).

## 6. 버전과 지원 범위

**버전 값이 두 군데서 다르게 나오는 이유**: 이 코드베이스는 버전을 두 가지 별도 트랙으로 관리합니다(둘 다 제공 코드의 값이며 `student/extension.mjs`에는 버전 문자열이 없습니다. 학생이 바꾸지 않았습니다).
- **시작 틀 배포판 버전**: `on-client/package.json`의 `name: "alekov-client-starter"`, `version: "0.2.11"`. `README.md` 제목("내 보안 Agent 시작 틀 0.2.11")과도 일치합니다. 이번 제출의 시작 틀 자체 버전은 **0.2.11**입니다.
- **서버 컴포넌트 자체 보고 버전**: `src/server.mjs`의 `meta()` 함수가 돌려주는 `starterVersion:'0.1.0'`과 `/api/diagnostics` 응답의 `component:'on-client', version:'0.1.0'`은 배포판 버전과 **별개의, 서버 컴포넌트 자신을 가리키는 내부 버전 문자열**입니다. 코드 원문에 두 값을 하나로 맞추는 로직이 없어, 둘이 다른 것은 드리프트 버그가 아니라 애초에 서로 다른 것을 가리키는 두 값입니다.

이 재현 기록과 21단계 설명서가 가리키는 **이번 제출의 최종 앱 버전은 시작 틀 배포판 기준 0.2.11**입니다. `/api/diagnostics`가 보고하는 `0.1.0`은 그 안의 서버 컴포넌트 자체 버전이며, 혼동하지 않도록 여기 명시합니다.

- 검증 환경: Windows, Node.js `v24.19.0`, Git.
- 지원 범위: `on-client` 폴더 단독 실행(엔진·AI 미연결 상태의 화면 동작)까지 새 환경에서 재현 확인했습니다.
- 미해결·미확인 (운영자 준비 필요, 학생이 해결할 수 없음):
  - 실제 SDP 접근제어·XDR 엔진 연결(로그인·기기·업무앱·보안기록의 실제 데이터)
  - AI 게이트웨이 `verified` 연결과 실제 사건 설명 호출(`ai_model_called`)
  - 19단계 보안 조치의 실제 집행(`prepared`→`executing`→`succeeded`)
  - 20단계 OSV 조회의 `complete`/`partial`/`known_vulnerabilities` 실제 표시(현재는 `not_configured`만 재현)
- 이 22단계 통과는 **서버의 AI가 이 원문과 재현 기록을 읽고 코드·문서가 서로 맞는지 판정한 결과**이며, 실제 운영 환경에서의 자동 실행 인증이나 v1.0 자동 인증이 아닙니다. 위에 적은 "확인함"은 전부 제가 이 PC에서 직접 명령을 실행하고 결과를 본 것이며, AI가 추측하거나 실행하지 않은 내용을 확인된 것처럼 적지 않았습니다.
