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

## DB-backed Explorer data

Production 앱은 `/admin` 화면에서 Explorer 데이터를 DB로 관리할 수 있습니다.

- JSON Explorer 데이터는 dataset version과 country/region을 선택해서 업로드합니다.
- Mapping Table Explorer 데이터는 dataset version 단위로 업로드합니다.
- String Resource Explorer 데이터는 dataset version 단위로 업로드하고, 엑셀의 locale 컬럼은 `ko`, `es-rMX`, `en-rUS` 같은 Android qualifier 이름으로 표시합니다.
- 일반 사용자는 각 Explorer 화면에서 사용할 dataset을 선택해서 검색합니다.

필요한 환경변수:

```text
DATABASE_URL=Neon Postgres connection string
JSON_ADMIN_KEY=관리자 업로드/삭제에 사용할 비밀 키
```

초기 DB 설정:

1. Neon 프로젝트를 생성합니다.
2. Neon SQL Editor에서 `web/db/schema.sql` 내용을 실행합니다.
3. Vercel 프로젝트의 Environment Variables에 `DATABASE_URL`과 `JSON_ADMIN_KEY`를 추가합니다.
4. `/admin`에서 관리자 키를 입력한 뒤 필요한 tool 탭을 선택합니다.
5. dataset을 만들고, JSON은 country/region과 language 값을 함께 입력한 뒤 파일을 업로드합니다.

관련 API:

```text
GET    /api/json-records
GET    /api/json-records/:id
GET    /api/datasets?tool=json
GET    /api/datasets?tool=mapping_table
GET    /api/datasets?tool=string_resource
GET    /api/mapping-rows
GET    /api/string-resources
POST   /api/admin/datasets
POST   /api/admin/datasets/:id/active
GET    /api/admin/json-records/status
POST   /api/admin/json-records/import
POST   /api/admin/mapping-table/import
POST   /api/admin/string-resources/import
DELETE /api/admin/json-records/:id
DELETE /api/admin/json-batches/:id
```

`DATABASE_URL`은 브라우저에 노출되지 않고 서버 API에서만 사용합니다. Dataset 생성, 업로드, 삭제 같은 관리 작업은 `JSON_ADMIN_KEY`가 맞을 때만 처리됩니다.

## GitHub에 올릴 때 주의

- `window` 폴더는 로컬에만 두고 GitHub에는 올리지 않습니다.
- 로그 파일과 로컬 도구 상태는 Git에서 제외합니다.
- Vercel 배포 대상은 `web` 폴더입니다.
- 기본 파일 처리와 탐색은 브라우저에서 수행하고, 서버 API는 파일명 번역과 DB 저장/조회/삭제를 담당합니다.
