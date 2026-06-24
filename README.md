# JsonParse

JSON 로그 문자열과 `.json` 파일을 정리해서 다운로드할 수 있는 팀용 웹앱입니다.

## 폴더 구성

```text
web/      Vercel 배포용 웹앱
window/   로컬 Windows 앱 작업 폴더, GitHub 배포 대상 제외
```

## 웹앱

웹앱은 붙여넣은 로그나 업로드한 JSON 파일에서 JSON을 등록하고, `recognitionText` 기반 파일명으로 정리한 뒤 ZIP 파일로 다운로드합니다.

Production URL:

```text
https://mz-json.vercel.app/
```

Vercel에 배포할 때는 프로젝트의 Root Directory를 반드시 `web`으로 설정합니다.

자세한 배포 방법:

```text
web/docs/VERCEL_DEPLOYMENT.md
```

로컬 실행:

```powershell
cd web
npm start
```

로컬 주소:

```text
http://localhost:3000/
```

테스트:

```powershell
cd web
npm test
```

## JSON DB Admin

DB 기반 JSON 관리는 `/admin` 화면에서 합니다.

필요한 환경변수:

```text
DATABASE_URL=Neon Postgres connection string
JSON_ADMIN_KEY=관리자 업로드/삭제에 사용할 비밀 키
```

기본 관리자 비밀번호는 `1313`입니다. `JSON_ADMIN_KEY`를 설정하면 환경변수 값이 기본 비밀번호보다 우선합니다.

초기 DB 설정:

1. Neon 프로젝트를 생성합니다.
2. Neon SQL Editor에서 `web/db/schema.sql` 내용을 실행합니다.
3. Vercel 프로젝트의 Environment Variables에 `DATABASE_URL`을 추가합니다. 관리자 비밀번호를 바꾸려면 `JSON_ADMIN_KEY`도 추가합니다.
4. `/admin`에서 관리자 키와 Language 값을 입력한 뒤 JSON 파일을 업로드합니다.

관련 API:

```text
GET    /api/json-records
GET    /api/json-records/:id
GET    /api/admin/json-records/status
POST   /api/admin/json-records/import
DELETE /api/admin/json-records/:id
DELETE /api/admin/json-batches/:id
```

`DATABASE_URL`은 브라우저에 노출되지 않고 서버 API에서만 사용합니다. 업로드와 삭제는 `JSON_ADMIN_KEY`가 맞을 때만 처리됩니다.

## GitHub에 올릴 때 주의

- `window` 폴더는 로컬에만 두고 GitHub에는 올리지 않습니다.
- 로그 파일과 로컬 도구 상태는 Git에서 제외합니다.
- Vercel 배포 대상은 `web` 폴더입니다.
- 기본 파일 처리와 탐색은 브라우저에서 수행하고, 서버 API는 파일명 번역과 DB 저장/조회/삭제를 담당합니다.
