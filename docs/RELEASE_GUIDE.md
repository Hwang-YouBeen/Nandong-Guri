# 난동구리 배포 가이드

난동구리는 GitHub Actions에서 macOS와 Windows 설치 파일을 각각 빌드하고 하나의 GitHub Release로 공개합니다.

## 사용자에게 제공되는 파일

태그 배포가 성공하면 Release에 다음 파일이 첨부됩니다.

```text
Nandong-Guri-v0.1.2-macOS.dmg
Nandong-Guri-v0.1.2-Windows.msi
Nandong-Guri-v0.1.2-Windows-setup.exe
nandong-guri-browser-extension-v0.1.2.zip
```

macOS와 Windows 앱은 서로 호환되지 않으므로 사용자는 자신의 운영체제에 맞는 설치 파일을 받아야 합니다. 브라우저 확장 ZIP은 두 운영체제에서 공통으로 사용합니다.

## 자동 배포 흐름

`.github/workflows/release.yml`은 `v*` 태그가 GitHub에 푸시될 때 실행됩니다.

1. macOS 러너가 Intel과 Apple Silicon을 함께 지원하는 Universal `.dmg`를 빌드합니다.
2. Windows 러너가 `.msi`와 NSIS 설치용 `.exe`를 빌드합니다.
3. Linux 러너가 `browser-extension` 폴더를 ZIP으로 압축합니다.
4. 세 작업이 모두 성공하면 GitHub Release를 공개하고 파일을 첨부합니다.

## 새 버전 배포

먼저 다음 파일의 버전을 동일하게 맞춥니다.

- `desktop-app/package.json`
- `desktop-app/package-lock.json`
- `desktop-app/src-tauri/Cargo.toml`
- `desktop-app/src-tauri/tauri.conf.json`
- `browser-extension/manifest.json`

로컬 검사를 실행합니다.

```bash
cd desktop-app
npm ci
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cd ..
node --check browser-extension/content.js
node --check browser-extension/background.js
```

변경 사항을 커밋한 뒤 같은 버전의 태그를 푸시합니다.

```bash
git add .
git commit -m "Release v0.1.2"
git push origin main
git tag v0.1.2
git push origin v0.1.2
```

GitHub 저장소의 `Actions` 탭에서 `Build and release` 작업을 확인합니다. 모든 작업이 성공하면 `Releases`에 설치 파일이 나타납니다.

## 설치 시 보안 안내

현재 자동 빌드는 코드 서명 인증서를 사용하지 않습니다.

- macOS에서는 처음 실행할 때 개발자를 확인할 수 없다는 경고가 나타날 수 있습니다. 사용자는 시스템 설정의 개인정보 보호 및 보안에서 실행을 허용해야 합니다.
- Windows에서는 Microsoft Defender SmartScreen 경고가 나타날 수 있습니다. 사용자는 파일 출처를 확인한 뒤 추가 정보에서 실행을 선택해야 합니다.

공개 배포 품질을 높이려면 이후 Apple Developer ID 서명·공증과 Windows 코드 서명을 GitHub Actions 비밀 값으로 추가해야 합니다.

## 대용량 제작 원본

Blender, FBX, STL, 보존 ZIP과 2D 참고 이미지는 앱 실행과 빌드에 필요하지 않아 GitHub 저장소에서 제외합니다. 최종 앱이 사용하는 GLB, 텍스처와 UI 이미지는 `desktop-app/public`에 포함되어 있으므로 macOS와 Windows 빌드에는 영향을 주지 않습니다.

## 배포 실패 확인

- `npm ci` 실패: `package-lock.json`이 최신인지 확인합니다.
- Rust 빌드 실패: `Cargo.lock`과 Tauri 의존성을 확인합니다.
- Windows 번들 실패: NSIS 또는 MSI 로그를 확인합니다.
- Release 생성 실패: 워크플로의 `contents: write` 권한과 저장소 Actions 권한을 확인합니다.
- 태그만 보이고 파일이 없음: GitHub `Actions`의 실패 작업을 열어 로그를 확인합니다.
