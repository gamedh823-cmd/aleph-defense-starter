# 22단계 — 최종 커밋 새 환경 재현 기록

이 문서는 13~21단계 코드와 문서([STUDENT_RUNBOOK.md](STUDENT_RUNBOOK.md))가 **별도의 새 폴더에서 실제로 돌아가는지** 직접 재현한 결과입니다. 이 문서 자체를 더하는 커밋 외에 `student/extension.mjs` 등 기존 코드는 바꾸지 않았습니다. 아래 재현은 그 직전 커밋(이 문서가 실린 커밋의 부모 커밋, 코드 내용은 이 제출 커밋과 동일)을 대상으로 수행했습니다.

## 1. 재현 대상

- 저장소: `https://github.com/gamedh823-cmd/aleph-defense-starter`
- 브랜치: `main`
- 재현한 커밋: `7645d5a87305e9bd2770144840c05423c673e7c7`("21단계: 취약점 조회 구성도와 오류 원인을 실제 코드에 맞춰 수정")
- 이 재현 이후 이 문서(`on-client/docs/STUDENT_REPRODUCTION.md`)를 두 차례 더 고쳤고(최초 작성, `reproduction_record_consistency`·`data_preservation_plan` 판정 반영 수정), 그때마다 **이 파일 하나만** 바꿔 커밋했습니다. 아래는 재현 대상 커밋(`7645d5a`)과 이번 제출 커밋 사이의 실제 `git diff --stat` 결과이며, 바뀐 파일이 이 문서 하나뿐이고 실행 코드(`on-client/src/*`, `on-client/public/*`, `on-client/student/*`, `on-client/tools/*`)는 전혀 바뀌지 않았다는 것을 그대로 보여 줍니다. 즉 3절의 재현 절차는 이번 제출 커밋의 코드에도 그대로 적용됩니다.

  ```
  $ git diff --stat 7645d5a87305e9bd2770144840c05423c673e7c7 HEAD
   on-client/docs/STUDENT_REPRODUCTION.md | 82 ++++++++++++++++++++++++++++++++++
   1 file changed, 82 insertions(+)
  ```
  (위 출력은 이 문단을 쓰는 시점의 작업 트리 기준이며, 이 문장 자체를 추가하는 한 줄만큼 실제 커밋 시점엔 삽입 줄 수가 조금 더 늘어날 수 있습니다. 바뀐 **파일은 여전히 `on-client/docs/STUDENT_REPRODUCTION.md` 하나뿐**입니다 — 위 명령을 그대로 실행하면 누구나 같은 사실을 확인할 수 있습니다.)

  확인 방법(다른 사람도 그대로 재현할 수 있도록 명령을 남깁니다):
  ```powershell
  git diff --stat 7645d5a87305e9bd2770144840c05423c673e7c7 HEAD
  ```

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
| 조치 요청·상태·감사 기록(`alekov_action_intents`/`alekov_action_state`/`alekov_action_audit`) | 운영자가 지정하는 **기존** SQLite DB 파일(`databasePath`), 저장소 밖 | `src/actions/store.mjs`(`createActionStore`), `src/server.mjs` 212~224행(`sdpActionStartup.databasePath`) | **운영자**(DB 파일 소유자) | DB 파일 자체를 운영자가 백업·복원. `intents`·`audit` 테이블은 `BEFORE UPDATE`/`BEFORE DELETE` 트리거로 수정·삭제가 막혀 있어(코드 원문 확인) 복원해도 과거 기록이 바뀌지 않음 | **복원 직후 자동 재집행 금지**: `status`가 `pending`/`succeeded`로 복원되더라도 그 자체를 효과로 보지 않고, 19단계 화면 기준대로 연동 시스템에 **재조회**해서 `observation.effectApplied`를 다시 확인해야 함(이 문서 작성 기준 학생 쪽에서 실제로 복원해 본 적 없음, 코드 리뷰로만 확인) |
| AI 게이트웨이 자격증명(`sk-on-...` 토큰) | 운영자가 지정하는 `vaultRoot` 아래, Windows DPAPI로 암호화 | `src/ai/credential-vault.mjs`(`createAppCredentialVault`, `process.platform!=='win32'`면 `ALEKOV_VAULT_WINDOWS_REQUIRED`로 거부), `tools/app-credentials.ps1` | 운영자/해당 PC 사용자 | DPAPI 암호화 파일 자체를 복사 가능 | **DPAPI는 암호화한 Windows 계정+PC에 종속**이라 다른 PC나 다른 윈도우 계정으로 파일만 옮기면 복호화할 수 없음. 이동하려면 파일 복사가 아니라 새 PC에서 **승인 절차를 처음부터 다시** 밟아야 함(이 문서 작성 기준 실제로 다른 PC로 옮겨 본 적 없음, 코드 원문으로만 확인) |
| 네이티브 호스트 등록 정보(계정 연결용) | Windows 레지스트리(머신·계정별 로컬 상태) | `tools/native-host-registry.ps1`("별도 호스트 registry. 원 Vault·학생 폴더에는 파일을 쓰지 않는다") | 해당 PC 사용자 | 레지스트리 내보내기/가져오기는 운영자 안내를 따름(이 문서에서 다루지 않음) | PC를 옮기면 레지스트리도 옮겨야 하며, 그 PC의 Windows 사용자 계정에 종속 |

위 네 가지 중 **소스 코드·커밋 이력**만 학생(이 저장소)이 직접 보존할 책임이 있고, 나머지 셋(조치 DB·DPAPI 자격·네이티브 레지스트리)은 전부 저장소 밖·운영자 또는 실행 PC에 있는 외부 영속 자료라 이번 22단계 재현(2~3절)의 "새 빈 폴더에 clone"에는 포함되지 않았고, 포함될 수도 없습니다(운영자 설정값이므로).

## 6. 버전과 지원 범위

- 검증 환경: Windows, Node.js `v24.19.0`, Git.
- 지원 범위: `on-client` 폴더 단독 실행(엔진·AI 미연결 상태의 화면 동작)까지 새 환경에서 재현 확인했습니다.
- 미해결·미확인 (운영자 준비 필요, 학생이 해결할 수 없음):
  - 실제 SDP 접근제어·XDR 엔진 연결(로그인·기기·업무앱·보안기록의 실제 데이터)
  - AI 게이트웨이 `verified` 연결과 실제 사건 설명 호출(`ai_model_called`)
  - 19단계 보안 조치의 실제 집행(`prepared`→`executing`→`succeeded`)
  - 20단계 OSV 조회의 `complete`/`partial`/`known_vulnerabilities` 실제 표시(현재는 `not_configured`만 재현)
- 이 22단계 통과는 **서버의 AI가 이 원문과 재현 기록을 읽고 코드·문서가 서로 맞는지 판정한 결과**이며, 실제 운영 환경에서의 자동 실행 인증이나 v1.0 자동 인증이 아닙니다. 위에 적은 "확인함"은 전부 제가 이 PC에서 직접 명령을 실행하고 결과를 본 것이며, AI가 추측하거나 실행하지 않은 내용을 확인된 것처럼 적지 않았습니다.
