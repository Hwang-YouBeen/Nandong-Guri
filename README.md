# 난동구리 · Nandong Guri

ChatGPT와 Gemini의 답변이 끝나면 작은 3D 너구리가 화면에 출동하는 macOS·Windows 데스크톱 앱입니다. 다른 작업을 하다가 너구리를 클릭하면 답변이 완료된 기존 브라우저 탭으로 돌아갑니다.

## 주요 기능

- ChatGPT·Gemini 웹 답변 완료 자동 감지
- 화면 전체를 걷고 뛰다가 제자리에서 춤추는 3D 너구리
- 반응하지 않으면 5초마다 강해지는 난동
- 너구리 부분만 클릭되고 나머지 화면은 클릭 통과
- 클릭 시 답변을 생성했던 기존 브라우저 창과 탭 활성화
- macOS 메뉴바·Windows 시스템 트레이 상주
- 여러 모니터 순환
- 시스템 알림, 등장·클릭 효과음
- 로그인 시 자동 실행
- 긴급 퇴장 단축키 `Command/Ctrl + Shift + G`

## 지원 환경

| 구분 | 지원 |
| --- | --- |
| 운영체제 | macOS, Windows |
| 브라우저 | Chrome, Microsoft Edge |
| AI 서비스 | ChatGPT 웹, Gemini 웹 |

Safari와 Firefox, 모바일 앱은 현재 지원하지 않습니다.

## 사용자 설치

난동구리는 **데스크톱 앱**과 **브라우저 확장 프로그램**을 함께 사용합니다.

### 1. 데스크톱 앱 설치

[최신 GitHub Release](https://github.com/Hwang-YouBeen/Nandong-Guri/releases/latest)에서 운영체제용 파일을 내려받습니다.

- macOS: `Nandong-Guri-*-macOS.dmg` (Intel·Apple Silicon 공용)
- Windows: `Nandong-Guri-*-Windows-setup.exe`
- 브라우저 확장: `nandong-guri-browser-extension-*.zip`

현재 개발 버전을 직접 빌드하려면 아래의 [개발 및 빌드](#개발-및-빌드)를 참고하세요.

### 2. 브라우저 확장 프로그램 설치

Release에서 받은 확장 프로그램 ZIP의 압축을 푼 뒤, 해당 폴더를 Chrome 또는 Edge의 확장 프로그램 화면에서 불러옵니다.

처음 설치하는 사용자는 [초보자용 확장 프로그램 설치 가이드](docs/EXTENSION_INSTALL.md)를 따라 하세요.

### 3. 사용하기

1. 난동구리 앱을 실행합니다.
2. macOS 메뉴바 또는 Windows 시스템 트레이에서 난동구리 아이콘을 찾습니다.
3. 아이콘을 클릭해 설정창을 열고 상태가 `준비됨`인지 확인합니다.
4. ChatGPT 또는 Gemini에 질문한 뒤 다른 작업을 합니다.
5. 답변이 끝나면 나타난 너구리를 클릭합니다.
6. 답변을 생성했던 기존 탭으로 이동하면 정상입니다.

설정창의 `×` 버튼은 앱 종료가 아니라 창 숨김입니다. 앱을 완전히 종료하려면 메뉴바 또는 시스템 트레이 아이콘을 오른쪽 클릭한 뒤 `난동구리 종료`를 선택합니다.

## 설정

- **효과음**: 너구리가 처음 등장할 때와 클릭할 때 소리를 재생합니다.
- **시스템 알림**: 답변 완료 시 macOS 또는 Windows 알림을 표시합니다.
- **로그인 시 자동 실행**: 운영체제 로그인 후 난동구리를 백그라운드에서 자동 실행합니다.
- **너구리 크기**: 다음 출동부터 적용할 3D 너구리 크기를 조절합니다.
- **긴급 퇴장**: `Command/Ctrl + Shift + G`로 화면의 너구리를 즉시 숨깁니다.

## 개발 및 빌드

필요 환경:

- Node.js와 npm
- Rust stable
- macOS: Xcode Command Line Tools
- Windows: Microsoft C++ Build Tools와 WebView2

```bash
cd desktop-app
npm install
npm run tauri dev
```

프로덕션 빌드:

```bash
cd desktop-app
npm run tauri build
```

운영체제별 설치 파일은 해당 운영체제에서 빌드해야 합니다.

- macOS: `desktop-app/src-tauri/target/release/bundle/`
- Windows: `desktop-app/src-tauri/target/release/bundle/`

자세한 배포 절차는 [배포 가이드](docs/RELEASE_GUIDE.md)를 참고하세요.

`v*` 형식의 Git 태그를 푸시하면 GitHub Actions가 macOS와 Windows 설치 파일 및 확장 프로그램 ZIP을 자동으로 만들고 Release를 공개합니다.

## 프로젝트 구조

| 경로 | 내용 |
| --- | --- |
| `desktop-app` | Tauri·Rust·React·Three.js 데스크톱 앱 |
| `browser-extension` | ChatGPT·Gemini 완료 감지 Chrome·Edge 확장 프로그램 |
| `docs` | 제품 명세, 설치, 테스트와 배포 문서 |
| `3d-character-animation` | Mixamo·Blender 애니메이션 제작 원본 |
| `2d-character-references` | 캐릭터 참고 이미지 |
| `3d-printing-keyring` | 5cm 2색 키링 제작 자료 |
| `brand-assets` | 앱 아이콘과 설정 화면 이미지 원본 |
| `archives` | 보존용 압축 원본 |

더 자세한 설명은 [프로젝트 구조 문서](docs/PROJECT_STRUCTURE.md)를 참고하세요.

## 문서

- [제품 기능 명세](docs/PRODUCT_SPEC.md)
- [확장 프로그램 설치 가이드](docs/EXTENSION_INSTALL.md)
- [테스트 가이드](docs/TESTING.md)
- [배포 가이드](docs/RELEASE_GUIDE.md)
- [프로젝트 구조](docs/PROJECT_STRUCTURE.md)

## 기술 구성

- Tauri 2, Rust
- React, TypeScript, Vite
- Three.js, GLB
- Manifest V3 브라우저 확장
- 로컬 HTTP 브리지 `127.0.0.1:43119`
