# 22단계 — 최종 커밋 새 환경 재현 기록

이 문서는 13~21단계 코드와 문서([STUDENT_RUNBOOK.md](STUDENT_RUNBOOK.md))가 **별도의 새 폴더에서 실제로 돌아가는지** 직접 재현한 결과입니다. 이 문서 자체를 더하는 커밋 외에 `student/extension.mjs` 등 기존 코드는 바꾸지 않았습니다. 아래 재현은 그 직전 커밋(이 문서가 실린 커밋의 부모 커밋, 코드 내용은 이 제출 커밋과 동일)을 대상으로 수행했습니다.

## 1. 재현 대상

- 저장소: `https://github.com/gamedh823-cmd/aleph-defense-starter`
- 브랜치: `main`
- 재현한 커밋: `7645d5a87305e9bd2770144840c05423c673e7c7`("21단계: 취약점 조회 구성도와 오류 원인을 실제 코드에 맞춰 수정")
- 이 재현 이후 이 문서(`on-client/docs/STUDENT_REPRODUCTION.md`)만 여러 차례 고쳐 커밋했고, 그 외 실행 코드는 건드리지 않았습니다. 재현은 **2026-10-23 15시대**(저장소의 `7645d5a` 커밋 시각 15:08과, 이 재현을 바탕으로 한 뒤이은 제출들의 접수 시각 15:15~15:34 사이)에 수행했습니다.
- **해시 재계산 경위**: 바로 앞 제출에서 작업 폴더의 파일을 `sha256sum`으로 직접 읽어 표를 만들었는데, 이 저장소는 `core.autocrlf=true`(확인함: `git config --get core.autocrlf` → `true`)로 체크아웃 시 줄바꿈을 LF→CRLF로 바꿔 저장합니다. 그래서 제가 디스크에서 직접 읽은 바이트(CRLF)와, Git이 커밋에 실제로 저장한 바이트(LF)가 달라 해시가 어긋났습니다(심판이 알려준 `server.mjs` 해시 `32ce16...`와 `extension.mjs` 해시 `d3c8e3...`를 `git show <커밋>:<경로> | sha256sum`으로 다시 계산해 보니 정확히 일치함을 확인했습니다). 아래 표는 **Git이 실제로 커밋에 저장한 블롭 내용**을 기준으로 다시 계산한 값이며, 작업 폴더를 그냥 열어 읽은 값이 아닙니다.

  | 파일 | SHA-256(Git 블롭 기준) |
  |---|---|
  | `on-client/package.json` | `1e111473de7526fd674a6a5fab7167921e2f3c7ccc8a45019712585e0965a419` |
  | `on-client/.on-starter-manifest.json` | `72af362876cb23c9433acd03f5faf9912fc9df65a9c543f30cc9d1706c3acbfe` |
  | `on-client/src/server.mjs` | `32ce16598554ffcd044e3aaa1caf91bcc70f10efb42ea279463cd2a7f7d1f010` |
  | `on-client/src/engine.mjs` | `67a4f794eccbe7c5ba922b030cacb92c1473e2f9ef6ab1a69f8619a3292c58df` |
  | `on-client/src/ai/service.mjs` | `96537ad8da6b498be7e13e05eb9183301f07de4c40dcac7456f7b5ebf1c564e1` |
  | `on-client/src/ai/credential-vault.mjs` | `94a3c22cd2283338f0e1cf1cc58d56709807606da8dd34b26c43a37d51799cf2` |
  | `on-client/src/vulnerabilities/project-scan.mjs` | `ce4e56b2bc823be3835bbb5a3416d5506d1de96688e34d684894f42bba1f1154` |
  | `on-client/src/vulnerabilities/osv.mjs` | `c49abd811168e4879fa82eeb23638e4fe86751ef5e52a9eba4eccff46261a914` |
  | `on-client/src/actions/store.mjs` | `b75f4e73f007ffabb9f38cc6d092c444b0736af9a8b4d4f2c3912539718927d1` |
  | `on-client/public/app.js` | `e4330a92e5a5bdceed3489088eef5a566dac24341955259feada845473debf7a` |
  | `on-client/student/extension.mjs` | `d3c8e34e4977d30cf6eda2b7905bab65ba8a2cc729e6157bd1327bb07a774cb6` |
  | `on-client/student/engine-adapter.mjs` | `a097322e58b11aa48d87369e67e48a7a8bf72416d958c1e101e17d3b77fbf838` |
  | `on-client/tools/start-alekov.ps1` | `8953268698284c644a14651956c7a73c3e4a4025b59d23c692e8580d5d054384` |
  | `on-client/tools/native-host-registry.ps1` | `ece6db6dd0bdf5698c9c4276ccecbdca761f38f3d6f2cefd0d76c2739c2fd573` |

  확인 방법(이번 제출 커밋 하나만 받아서 검증 — Git for Windows에 포함된 **Git Bash**에서, 작업 폴더의 파일을 직접 읽지 않고 **Git이 커밋에 저장한 블롭 내용**을 기준으로 확인합니다. PowerShell의 `Get-FileHash`로 작업 폴더 파일을 바로 읽으면 체크아웃 시 줄바꿈이 CRLF로 바뀐 뒤의 값이 나와 이 표와 다를 수 있습니다):
  ```bash
  git show HEAD:on-client/src/server.mjs | sha256sum
  ```
  (다른 파일도 경로만 바꿔 같은 명령으로 확인합니다. 이 문서의 표는 이 명령으로 직접 계산한 값입니다.)
- **다시 확인하지 못한 기능**: 이 보정 작업은 해시 재계산과 문서 수정이며, 3절에 적은 실제 실행 재현(서버 기동·화면 확인·OSV 조회)을 다시 수행하지는 않았습니다. 3절의 관찰 결과는 `7645d5a` 재현 시점 그대로이고, 이번 수정은 그 관찰이 가리키는 파일 내용이 지금 제출 커밋과 같은 바이트인지를 다시 확인한 것입니다.

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
| 네이티브 호스트(계정 연결) 등록 정보 | **Windows 레지스트리가 아니라**, 운영자가 지정하는 `registryRoot` 폴더 아래 `.alekov-native-registry.json`(프로젝트 목록·history·heads) + `vaultRoot` 아래 `.alekov-owner.json` — 둘 다 평범한 JSON 파일 | `tools/native-host-registry.ps1`(`$statePath=[IO.Path]::Combine($registry,'.alekov-native-registry.json')`, `Marker` 함수의 `.alekov-owner.json`) | 해당 PC 사용자(파일 ACL이 현재 Windows 계정 SID로 고정됨, 코드의 `Acl`/`PrivateAcl` 함수 확인) | 아래 "네이티브 등록 정보 복원·이동" 참고 | **디렉터리 identity 결속**: 매 요청마다 `registryRoot` 디렉터리를 열어 NTFS 파일 ID로 `registryIdentity`를 다시 계산하고, 그 값이 JSON 안에 저장된 `state.registryIdentity`와 다르면 `NATIVE_HOST_STORAGE_INVALID`로 거부합니다(코드의 `HoldChain`/`$registryIdentity` 비교 확인). 프로젝트 쪽도 `pathDigest`(경로)와 `directoryInstance`(NTFS 파일 ID)가 같이 맞아야 기존 등록을 찾습니다 |

**네이티브 등록 정보 복원·이동(코드 재확인으로 구분)**:
- **같은 PC·같은 `registryRoot` 폴더를 그대로 쓰는 복원**(그 폴더 자체를 지우거나 새로 만들지 않고, 그 안의 `.alekov-native-registry.json`만 백업본으로 바꿔치기): 디렉터리 자체의 NTFS 식별자는 바뀌지 않으므로 코드의 identity 검사를 통과할 **여지가 있습니다**(코드 원문 근거, 실제로 복원해 보지는 않아 미확인).
- **다른 폴더·다른 드라이브·다른 PC로 옮기는 경우**: 새 디렉터리는 반드시 다른 NTFS 식별자를 가지므로, 복사한 JSON 안의 `registryIdentity`와 맞지 않아 거부됩니다. 이건 "복원"으로 되는 일이 아니라, `statePath` 파일이 아예 없는 빈 디렉터리에서 시작하는 **새 등록**(코드의 `if(![IO.File]::Exists($statePath))` 분기, 처음 상태를 새로 만듦) 절차이며, 운영자가 해당 PC에서 계정 연결·승인을 처음부터 다시 진행해야 합니다.
- 어느 경우든 쓰기마다 `.native-history-<guid>.bak`로 이전 버전이 자동으로 함께 남습니다(불변 이력, 코드의 `Persist` 함수 확인).

**DB 백업·복원 절차(SQLite, 운영자 담당)**: `store.mjs`의 `BEFORE UPDATE`/`BEFORE DELETE` 트리거는 **이미 쓰인 행의 수정·삭제만 막을 뿐**, 오래된 백업 파일로 전체를 통째로 교체하면 그 이후에 쌓인 새 행 자체가 통째로 사라지는 것은 막지 못합니다(코드 재검토로 바로잡음). 그래서:
1. **쓰기 중지**: 백업 전 `node src/server.mjs` 프로세스를 먼저 종료해(SQLite 파일에 다른 프로세스의 쓰기가 없는 상태) 일관된 스냅샷을 보장합니다. 코드에 `PRAGMA journal_mode`를 명시적으로 켜는 부분이 없어(확인함, 기본 저널 모드로 추정) 서버가 켜진 채로 복사하면 일관되지 않은 사본이 될 수 있습니다.
2. **사본 확보**: 중지된 상태에서 DB 파일을 그대로 복사해 보관합니다.
3. **현재 원본 보관**: 복원(교체) 작업 전에 지금 쓰이고 있는 DB 파일도 별도 이름으로 먼저 복사해 둡니다 — 복원이 잘못됐을 때 되돌릴 수 있도록.
4. **복원 후 결과 재조회**: 백업 파일로 교체한 뒤 서버를 다시 켜고, 화면(19단계)에서 `prepared`/`pending`/`succeeded`로 보이는 항목을 성공으로 단정하지 말고 제공 화면의 「연동 시스템 결과만 재조회」로 실제 연동 시스템 상태를 다시 물어 `observation.effectApplied`를 확인합니다.
이 절차는 코드 원문(트리거 정의, `PRAGMA` 설정 여부)을 근거로 정리한 것이며, 이 문서 작성 기준 실제 백업·복원을 수행해 본 적은 없습니다(미확인).

위 네 가지 중 **소스 코드·커밋 이력**만 학생(이 저장소)이 직접 보존할 책임이 있고, 나머지 셋(조치 DB·DPAPI 자격·네이티브 등록 JSON)은 전부 저장소 밖·운영자 또는 실행 PC의 파일 시스템에 있는 외부 영속 자료라 이번 22단계 재현(2~3절)의 "새 빈 폴더에 clone"에는 포함되지 않았고, 포함될 수도 없습니다(운영자 설정값이므로).

## 6. 버전과 지원 범위

**버전 표기가 두 군데서 다릅니다(정정)**: 이전 판에서 이것이 의도된 별도 버전 체계라고 단정했는데, 근거가 "둘을 맞추는 로직이 없다"는 것뿐이라 그렇게 단정할 수 없었습니다. 실제 값만 정확히 남기고, 정책 여부는 미확인으로 둡니다.
- `on-client/package.json`의 `name: "alekov-client-starter"`, `version: "0.2.11"`. `README.md` 제목("내 보안 Agent 시작 틀 0.2.11")과 같은 값입니다.
- `src/server.mjs`의 `meta()` 함수가 돌려주는 `starterVersion:'0.1.0'`과, `/api/diagnostics` 응답의 `component:'on-client', version:'0.1.0'`. 필드 이름이 `starterVersion`이라 `package.json`의 배포판 버전과 같은 것을 가리키는 것처럼 보이는데도 값이 `0.1.0`으로 다릅니다.
- **이 둘이 서로 다른 트랙을 의도적으로 가리키는 것인지, 둘 중 하나가 갱신되지 않은 것인지는 코드 원문만으로 확인할 수 없습니다. 버전 표기 불일치가 남아 있고, 별도 버전 정책 여부는 미확인입니다.** 둘 다 제공 코드의 값이며 `student/extension.mjs`에는 버전 문자열이 없어 학생이 만든 불일치는 아닙니다.
- 이 문서와 [STUDENT_RUNBOOK.md](STUDENT_RUNBOOK.md)에서 "앱 버전"을 가리킬 때는 `package.json`의 **0.2.11**을 썼습니다. `/api/diagnostics`를 직접 호출하면 `0.1.0`이 보일 수 있다는 것을 미리 적어 둡니다.

- 검증 환경: Windows, Node.js `v24.19.0`, Git.
- 지원 범위: `on-client` 폴더 단독 실행(엔진·AI 미연결 상태의 화면 동작)까지 새 환경에서 재현 확인했습니다.
- 미해결·미확인 (운영자 준비 필요, 학생이 해결할 수 없음):
  - 실제 SDP 접근제어·XDR 엔진 연결(로그인·기기·업무앱·보안기록의 실제 데이터)
  - AI 게이트웨이 `verified` 연결과 실제 사건 설명 호출(`ai_model_called`)
  - 19단계 보안 조치의 실제 집행(`prepared`→`executing`→`succeeded`)
  - 20단계 OSV 조회의 `complete`/`partial`/`known_vulnerabilities` 실제 표시(현재는 `not_configured`만 재현)
- 이 22단계 통과는 **서버의 AI가 이 원문과 재현 기록을 읽고 코드·문서가 서로 맞는지 판정한 결과**이며, 실제 운영 환경에서의 자동 실행 인증이나 v1.0 자동 인증이 아닙니다. 위에 적은 "확인함"은 전부 제가 이 PC에서 직접 명령을 실행하고 결과를 본 것이며, AI가 추측하거나 실행하지 않은 내용을 확인된 것처럼 적지 않았습니다.
