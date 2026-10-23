# 22단계 — 최종 커밋 새 환경 재현 기록

이 문서는 13~21단계 코드와 문서([STUDENT_RUNBOOK.md](STUDENT_RUNBOOK.md))가 **별도의 새 폴더에서 실제로 돌아가는지** 직접 재현한 결과입니다. 이 문서 자체를 더하는 커밋 외에 `student/extension.mjs` 등 기존 코드는 바꾸지 않았습니다. 아래 재현은 그 직전 커밋(이 문서가 실린 커밋의 부모 커밋, 코드 내용은 이 제출 커밋과 동일)을 대상으로 수행했습니다.

## 1. 재현 대상

- 저장소: `https://github.com/gamedh823-cmd/aleph-defense-starter`
- 브랜치: `main`
- 재현한 커밋: `7645d5a87305e9bd2770144840c05423c673e7c7`("21단계: 취약점 조회 구성도와 오류 원인을 실제 코드에 맞춰 수정")
- 이 문서가 포함된 최종 제출 커밋은 위 커밋에 `on-client/docs/STUDENT_REPRODUCTION.md` 한 파일만 더한 것입니다. `on-client/student/extension.mjs`를 비롯한 코드는 재현 과정에서 고치지 않았으므로, 위에서 재현한 결과는 최종 제출 커밋에도 그대로 적용됩니다.

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

- 이 앱(`on-client`) 자체는 로컬 파일에 쓰기 동작이 없는 **상태 없는(stateless)** 정적/프록시 서버입니다(2절 확인). 보존해야 할 로컬 데이터가 없습니다.
- 유일하게 지속되는 값은 테마 선택(`#theme=light|dark`)이며, 이는 브라우저 주소의 URL 해시에만 있고 서버나 디스크에 저장되지 않습니다. 새 환경에서는 당연히 초기화됩니다(백업 대상 아님).
- 실제로 보존해야 하는 것은 **Git 커밋 이력**뿐이며, GitHub 공개 저장소(`gamedh823-cmd/aleph-defense-starter`)에 push되어 있어 별도 백업 없이도 복원 가능합니다. 제한: 저장소를 지우거나 강제 push로 이력을 덮으면 복구 수단이 없습니다(이 작업들은 하지 않았습니다).
- 운영자 측 SDP/AI 연결 설정 파일(native host·SDP host config)은 이 저장소 밖에 보관되는 구조라(README·CONNECTION_TROUBLESHOOT.md 기준) 학생 쪽 보존 계획에 포함되지 않습니다.

## 6. 버전과 지원 범위

- 검증 환경: Windows, Node.js `v24.19.0`, Git.
- 지원 범위: `on-client` 폴더 단독 실행(엔진·AI 미연결 상태의 화면 동작)까지 새 환경에서 재현 확인했습니다.
- 미해결·미확인 (운영자 준비 필요, 학생이 해결할 수 없음):
  - 실제 SDP 접근제어·XDR 엔진 연결(로그인·기기·업무앱·보안기록의 실제 데이터)
  - AI 게이트웨이 `verified` 연결과 실제 사건 설명 호출(`ai_model_called`)
  - 19단계 보안 조치의 실제 집행(`prepared`→`executing`→`succeeded`)
  - 20단계 OSV 조회의 `complete`/`partial`/`known_vulnerabilities` 실제 표시(현재는 `not_configured`만 재현)
- 이 22단계 통과는 **서버의 AI가 이 원문과 재현 기록을 읽고 코드·문서가 서로 맞는지 판정한 결과**이며, 실제 운영 환경에서의 자동 실행 인증이나 v1.0 자동 인증이 아닙니다. 위에 적은 "확인함"은 전부 제가 이 PC에서 직접 명령을 실행하고 결과를 본 것이며, AI가 추측하거나 실행하지 않은 내용을 확인된 것처럼 적지 않았습니다.
