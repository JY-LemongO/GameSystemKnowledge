# Development Workflow

이 문서는 공개 학습 페이지가 아니라 저장소 유지보수와 다음 작업 인수인계를 위한 내부 기준이다. 공개 내비게이션과 검색 색인에는 연결하지 않는다.

## 변하지 않는 프로젝트 방향

- 설명과 예제의 기준 언어는 C#이다. Unity 개발자가 읽는 것을 고려하지만 `UnityEngine` 의존성 자체를 학습 전제로 두지는 않는다.
- 공개 HTML에는 현재 학습할 수 있는 개념, 계약, 예제, 실습만 포함한다.
- 구현 로드맵, 릴리스 현황, 감사 결과, 작업 메모, 앞으로의 기능 계획은 공개 HTML과 검색 색인에 포함하지 않는다.
- C# 계약과 공개 설명이 충돌하면 `source/csharp/`의 실행 가능한 계약, 검증 결과, 공개 설명을 함께 수정해 다시 일치시킨다.
- JavaScript 런타임은 Runtime Contract Lab을 위한 관찰 도구이며, 공개 학습 계약의 기준 언어를 대체하지 않는다.

## Unity 호환성 정책

현재 `net9.0` C# 프로젝트는 저장소 밖에서 실행하는 verifier/reference build이며 Unity에 import하는 산출물이 아니다. 현재 안정 Unity 6의 관리 코드 기준은 [.NET Standard 2.1 또는 .NET Framework 4.8 API 프로필](https://docs.unity3d.com/6000.0/Manual/dotnet-profile-support.html)과 [C# 9 컴파일러](https://docs.unity3d.com/6000.0/Manual/csharp-compiler.html)이므로, Unity 소비용 target으로 `net10.0`을 채택하지 않는다.

향후 prebuilt DLL을 배포한다면 `netstandard2.1` target과 Unity 플랫폼별 로드를 검증하고, source/UPM으로 배포한다면 C# 9 문법과 지원 API 범위를 별도로 검증한다. Unity 6.7의 CoreCLR Desktop Player는 실험 단계이므로 생산 기준으로 삼지 않으며, [.NET 10 기반 toolchain을 목표로 하는 Unity 6.8](https://discussions.unity.com/t/path-to-coreclr-2026-upgrade-guide/1714279)이 정식 출시되고 필요한 target·backend 지원이 확인된 뒤 이 정책을 재검토한다.

두 C# 프로젝트의 `NuGetAudit=false`는 현재 외부 `PackageReference`가 없는 offline reference build이기 때문에 유지한다. 첫 외부 패키지를 도입하거나 Unity 배포 산출물 형식을 결정할 때 [NuGet Audit](https://learn.microsoft.com/en-us/nuget/concepts/auditing-packages)을 활성화하거나 별도 CI audit gate를 두는 정책으로 재검토한다.

## 브랜치와 배포 환경

| 브랜치 | 역할 | 배포 주소 |
| --- | --- | --- |
| 작업 브랜치 | 한 가지 변경을 구현하고 로컬 QA를 수행한다. | 배포하지 않음 |
| `dev` | `main` 반영 전 실제 배포 환경에서 확인하는 QA 기준 브랜치다. | <https://jy-lemongo.github.io/GameSystemKnowledge/preview/> |
| `main` | Preview 검수를 통과한 상태만 반영하는 운영 브랜치다. | <https://jy-lemongo.github.io/GameSystemKnowledge/> |

기본 승격 순서는 다음과 같다.

```text
작업 브랜치 -> dev -> 배포된 Preview QA -> main -> Production 확인
```

로컬 테스트 통과만으로 `main`에 바로 병합하지 않는다. `dev` 푸시 후 Preview가 배포한 `dev` HEAD SHA를 기록하고 실제 Preview를 검수한다. 검수한 SHA가 여전히 `dev` HEAD일 때만 `dev`를 `main`에 병합하며, `dev` 또는 기준 `main`이 바뀌었다면 Preview 배포와 검수를 다시 수행한다.

Pages workflow는 실행 시작 시 `main`과 `dev` SHA를 고정하고 두 커밋 모두에 동일한 `Repository QA`를 실행한다. 두 결과가 모두 성공한 경우에만 고정한 SHA를 다시 checkout해 배포하며, Production의 `/build-metadata.json`과 Preview의 `/preview/build-metadata.json`에 release/runtime version과 배포 SHA를 남긴다. Pull request도 같은 QA workflow를 사용하지만 Pages를 배포하지 않는다.

## 변경 완료 기준

1. 현재 코드, 공개 HTML, C# 계약, 다이어그램의 실제 상태를 먼저 확인한다.
2. 공개 페이지 수정은 학습 범위 안에서만 수행한다.
3. 내비게이션 문구를 수정했다면 `npm run site-shell`을 실행한다.
4. 파일을 변경한 뒤 `npm run manifest`로 `MANIFEST.sha256`을 갱신한다.
5. 최종적으로 `npm run qa`를 통과시킨다. 이 명령은 두 버전 도메인의 정합성 검사도 포함한다.
6. 작업 브랜치를 원격에 푸시하고 `dev`에 병합한다.
7. 배포된 Preview에서 build metadata의 `dev` SHA와 동작을 함께 확인한다.
8. 검수 후 `dev`와 기준 `main`이 바뀌지 않았을 때 `dev`를 `main`에 병합한다.

PR 병합으로 `main`의 merge commit SHA가 달라지는 것은 정상이며, 기준은 검수한 `dev` 상태가 그대로 포함됐는지다.

`npm run qa`는 release/runtime version 정합성, JavaScript 런타임 테스트, C# 참조 검증, 사이트 셸 일치, DOT render-input hash와 공개 SVG/PNG 형식·계약 일치, 검색 색인, 정적 계약, manifest, 데스크톱·모바일 브라우저 검사를 포함한다. Graphviz의 바이트 출력은 운영체제·renderer·font 버전에 따라 달라지므로 `assets/diagrams/source-manifest.json`이 UTF-8/LF로 정규화한 DOT에 공통 render profile을 적용한 입력 hash와 profile id로 변경 여부를 판정하고, 공개 SVG의 필수 계약 label은 정적 검증이 별도로 확인한다. 실행 결과는 추적하지 않는 `.artifacts/qa/<commitSha>/qa-results.json`에 두 버전, commit SHA, 도구 버전, stage별 상태와 count로 기록하며 CI는 이를 commit-keyed Actions artifact로 업로드한다. CI는 검색 색인 재생성 뒤 `git diff --exit-code`도 실행해 생성 결과가 커밋과 다르면 실패한다.

`MANIFEST.sha256`은 UTF-8 텍스트의 줄바꿈을 LF로 정규화해 해시하고, 바이너리는 원본 바이트를 해시한다. 따라서 Windows와 Linux의 체크아웃 줄바꿈 차이는 manifest 결과를 바꾸지 않는다.

## 소스 오브 트루스

- 저장소 릴리스 판본: `VERSION` (`package.json`과 현재 구현·changelog 판본이 일치해야 함)
- 런타임 의미 버전: `source/runtime/runtime-kernel.js`의 `RUNTIME_VERSION` (browser copy, d.ts, golden fixture, 공개 예시가 일치해야 함)
- 버전 정합성 검사: `source/tools/check_release_integrity.py`
- 공개 학습 범위와 저장소 역할: `README.md`
- C# 공개 계약과 실행 검증: `source/csharp/`
- 브라우저 Runtime Contract Lab: `source/runtime/`
- 계약 스키마: `source/contracts/`
- 다이어그램 원본: `source/diagrams/`
- 다이어그램 공통 테마와 생성 profile: `source/tools/render_diagrams.py`
- 공개 다이어그램 출력: `assets/diagrams/`
- 공개 페이지 목록과 검색 구성: `source/site-map.json`
- 사이트 정합성 검사: `source/tools/validate_site.py`
- 브라우저 UX 검사: `source/tools/browser_smoke.py`
- 과거 QA 증빙: `source/qa/history/<releaseVersion>/<commitSha>.json`

다이어그램 출력만 직접 고치지 않는다. 내용·관계·개별 배치는 원본 DOT에서, 공통 팔레트·선·타이포그래피는 render profile에서 수정한 뒤 SVG와 PNG를 다시 생성한다.

Graphviz와 `Noto Sans KR` 폰트를 설치한 개발 환경에서 다음 명령으로 34개 출력을 함께 갱신한다. Windows 기본 Graphviz 설치 경로는 자동 탐색하며, 별도 경로는 `GRAPHVIZ_DOT` 환경 변수로 지정한다.

```bash
npm run diagrams
npm run diagrams:check
```

새 다이어그램은 DOT·SVG·PNG와 Gallery 카드를 한 세트로 추가한다. 라벨이 있는 엣지에는 `splines=ortho`를 사용하지 않고, 동일한 두 노드 사이의 왕복선은 포트·색·스타일 또는 중간 라벨 노드로 방향을 구분한다.

## 현재 인수인계 기준점

- 기준 브랜치: `dev`
- 과거 C# 학습 시스템 감사 기준 커밋: `73be3bc6b6fa0d6662b63f432e9c45cf9c91fff0`
- 완료 범위: Combat, Skill, Effect, Status, SourceRef, Runtime 설명과 실행 가능한 C# 계약의 정합화
- 최신 검증 증빙: 대상 commit의 GitHub Actions `Repository QA` 상태·로그. 로컬에서는 `npm run qa`로 재검증한다.
- 역사 증빙: `QA_REPORT.md`와 `source/qa/history/`는 기록 당시 결과이며 현재 commit의 PASS를 의미하지 않는다.
- 현재 사실 정확성·실행 참조 정합성 범위의 알려진 P0/P1 문제: 없음. learner-authored capstone·평가 rubric·unseen variant 같은 구현 숙달 장치는 다음 학습 강화 범위다.
- 범위 밖 항목: production DB·network·engine 통합과 미실시 수동·부하 검증은 `source/runtime/README.md`와 `QA_REPORT.md`에 기록한다.

이 기준점은 이미 완료된 범위를 설명한다. 새로운 문제가 확인되지 않는 한 같은 감사를 처음부터 반복하지 않는다. 다음 학습 영역은 배포된 Preview를 검수한 뒤 현재 페이지와 이어지는 학습 가치가 있는지 판단해 별도 작업으로 정한다.

## 새 작업 세션 시작 순서

```bash
git switch dev
git pull --ff-only origin dev
git status -sb
```

그다음 `README.md`, 이 문서, 최근 `dev` 커밋을 읽고 배포된 Preview를 확인한다. 새 작업은 하나의 검토 가능한 범위로 분리하고, 완료 후 위 승격 순서를 따른다.
