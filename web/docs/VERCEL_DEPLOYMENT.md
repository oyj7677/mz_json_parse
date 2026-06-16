# Vercel Deployment

이 문서는 JSON Formatter 웹앱을 Vercel에 배포하는 방법을 정리합니다.

현재 Production URL:

```text
https://json-parse-formatter.vercel.app/
```

Vercel Project:

```text
oyj-s-projects/json-parse-formatter
```

GitHub Repository:

```text
https://github.com/oyj7677/mz_json_parse
```

## 배포 구조

```text
web/
  api/
    translate-filename.js   # Vercel Function
  public/
    index.html              # 정적 웹 화면
    app.js
    core.js
    styles.css
  package.json
  vercel.json
```

JSON 파싱, 파일 업로드 처리, ZIP 생성은 브라우저에서 실행됩니다.
서버 Function은 파일명 번역 요청(`/api/translate-filename`)만 처리합니다.

## GitHub 연동 배포

1. 프로젝트를 GitHub 저장소에 올립니다.
2. Vercel에서 `New Project`를 선택합니다.
3. GitHub 저장소를 선택합니다.
4. `Root Directory`를 `web`으로 설정합니다.
5. Framework Preset은 `Other` 또는 자동 감지값을 사용합니다.
6. 별도 Build Command는 필요하지 않습니다.
7. Deploy를 실행합니다.

저장소 루트가 `JsonParse`이고 그 안에 `web`, `window` 폴더가 같이 있으므로, Vercel 프로젝트 설정에서 반드시 `Root Directory = web`으로 설정해야 합니다.

## Vercel CLI 배포

`web` 폴더에서 실행합니다.

```powershell
cd C:\Users\mediazen\Desktop\mzProject\JsonParse\web
npm run deploy:vercel
```

로컬에서 Vercel 환경과 비슷하게 확인하려면 다음 명령을 사용합니다.

```powershell
npm run dev:vercel
```

## 로컬 실행

Vercel과 별개로 기존 로컬 서버도 계속 사용할 수 있습니다.

```powershell
npm start
```

기본 주소는 다음과 같습니다.

```text
http://localhost:3000/
```

## 배포 후 확인 항목

- 붙여넣기 JSON 등록
- `.json` 파일 여러 개 업로드
- `recognitionText` 기반 파일명 생성
- 영어 변환 옵션
- 모두 다운로드 ZIP 생성
- 깨진 JSON-like 문자열의 원문 저장

## 주의 사항

- 영어 변환 기능은 `recognitionText`를 Google Translate 요청에 사용합니다.
- JSON 원문 전체는 서버에 저장하지 않습니다.
- 외부 공개 URL로 배포되므로 팀 내부용이면 Vercel Authentication 같은 접근 제한을 검토하세요.
