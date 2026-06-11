# 난동구리 프로젝트 구조

프로젝트 루트 이름은 `nandong_guri`입니다. 실행 코드, 브라우저 확장, 문서와 제작 원본을 목적별로 분리했습니다.

```text
nandong_guri/
├── README.md
├── desktop-app/
├── browser-extension/
├── docs/
├── 3d-character-animation/
├── 2d-character-references/
├── 3d-printing-keyring/
├── brand-assets/
└── archives/
```

GitHub에는 앱 빌드에 필요한 코드와 런타임 에셋을 배포합니다. 용량이 큰 제작 원본 폴더인 `3d-character-animation`, `2d-character-references`, `3d-printing-keyring`, `archives`와 `brand-assets/generated-sources`는 로컬 작업 폴더에만 보관하며 `.gitignore`로 제외합니다.

## `desktop-app`

실제 난동구리 데스크톱 애플리케이션입니다.

- `src`: React UI와 Three.js 오버레이
- `src-tauri`: Rust 네이티브 기능과 Tauri 설정
- `public/assets/models`: 최종 런타임 GLB와 텍스처
- `public/assets/images`: 설정 화면에 사용하는 최종 투명 PNG
- `scripts`: 개발 및 로컬 이벤트 테스트 스크립트
- `node_modules`, `dist`, `src-tauri/target`: 설치·빌드 과정에서 생성되는 폴더

`src`, `src-tauri`, `public`은 프레임워크 표준 이름이므로 변경하지 않습니다.

## `browser-extension`

Chrome과 Microsoft Edge에서 ChatGPT·Gemini의 답변 완료를 감지합니다.

- `manifest.json`: Manifest V3 설정
- `content.js`: 답변 생성 상태와 완료 감지
- `background.js`: 기존 답변 탭과 브라우저 창 활성화
- `icons`: 확장 프로그램 아이콘

## `docs`

- `PRODUCT_SPEC.md`: 최종 제품 기능과 사용자 경험
- `EXTENSION_INSTALL.md`: 초보자용 확장 프로그램 설치 안내
- `TESTING.md`: 앱과 브라우저 연동 테스트 방법
- `PROJECT_STRUCTURE.md`: 현재 폴더 구조 설명
- `RELEASE_GUIDE.md`: GitHub와 운영체제별 배포 방법

## `3d-character-animation`

화면에서 움직이는 너구리의 제작 원본입니다.

- Mixamo에서 받은 동작별 FBX
- Blender 리깅·웨이트·애니메이션 병합 파일
- 앱 내보내기 전 GLB 원본

앱에서 실제 사용하는 최종 파일은 `desktop-app/public/assets/models`에 있습니다.

## `2d-character-references`

3D 모델과 브랜드 이미지를 만들 때 사용한 2D 너구리 참고 이미지입니다.

## `3d-printing-keyring`

5cm 크기의 흰색·검정색 2색 키링 제작 자료입니다.

- Blender 작업 파일
- 색상별 STL
- 출력 미리보기
- `source-model-meshy`: Meshy에서 받은 원본 모델과 텍스처

## `brand-assets`

앱 아이콘과 설정 화면 장식 이미지의 제작 원본입니다.

- `app-icon-source.png`: 처음 준비한 앱 아이콘 이미지
- `app-icon-artwork.png`: 앱 아이콘 아트워크
- `raccoon-character-reference.png`: 캐릭터 전체 참고 이미지
- `generated-sources`: 투명 배경 제거 전 크로마키 생성 원본
- `desktop-app/public/assets/images`: 실제 설정 화면에서 사용하는 투명 PNG

실행 앱은 이 폴더를 직접 참조하지 않습니다. 최종 런타임 이미지는 `desktop-app/public/assets/images`에 복사되어 있습니다.

## `archives`

당장 편집하지 않지만 원본 보존이 필요한 대용량 압축 파일을 보관합니다.
