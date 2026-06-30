# JSON Formatter

붙여넣은 JSON 로그 텍스트 또는 여러 .json 파일을 등록하고, 파일 이름을 정리하고, 모든 것을 하나의 ZIP 파일로 다운로드하는 로컬 웹 앱입니다.

## 프로그램 설명

이 도구는 JSON 모양의 문자열을 로그에서 복사하여 별도의 JSON 파일로 저장해야 하는 경우에 유용합니다. 다운로드하기 전에 유효한 JSON 형식이 지정됩니다. 잘못된 JSON 구문이 포함된 업로드된 파일은 여전히 ​​원본 원시 텍스트로 저장될 수 있습니다.

## 주요 기능

- 붙여넣은 로그 텍스트에서 여러 JSON 개체를 추출합니다.
- 여러 개의 .json 파일을 한 번에 업로드하세요.
- 생성된 파일 이름을 항목 목록에서 직접 편집하세요.
- 등록된 모든 항목을 하나의 ZIP 파일로 다운로드합니다.
- 줄 바꿈 및 두 공백 들여쓰기를 사용하여 유효한 JSON을 저장합니다.
- 잘못 업로드된 JSON 형식의 파일을 원시 원본 텍스트로 보존합니다.
- 선호하는 파일 이름으로 `recognitionText` 값을 사용하세요.
- 무료 Google 번역 요청을 통해서만 영어가 아닌 `recognitionText`를 파일 이름에 대해 영어로 번역하세요.
- 파일 이름을 번역할 때 JSON 콘텐츠를 변경하지 않고 유지하세요.
- 파일 이름을 생성할 수 없는 경우 `default_json_1.json`과 같은 안전한 대체 파일 이름을 사용하세요.
- 중복된 파일 이름을 자동으로 방지합니다.
- JSON Explorer, Mapping Table Explorer, String Resource Explorer 데이터를 DB dataset으로 관리할 수 있습니다.

## 파일 이름 규칙

1. `recognitionText`가 존재하는 경우 파일명 소스로 사용됩니다.
2. 공백은 밑줄로 대체됩니다.
3. 파일 이름에 사용할 수 없는 문자는 안전하게 정리됩니다.
4. 업로드된 파일에 `recognitionText`가 포함되어 있지 않으면 업로드된 원본 파일 이름이 사용됩니다.
5. 사용 가능한 파일 이름을 만들 수 없는 경우 `default_json_1.json`, `default_json_2.json`과 같은 기본 이름이 사용됩니다.
6. 중복된 이름은 자동으로 구분됩니다(예: `name.json`, `name_2.json`, `name_3.json`).

예:

```text
recognitionText: How many degrees is it now
download filename: How_many_degrees_is_it_now.json
```

## 실행 방법

Node.js 18 이상이 권장됩니다. 본 프로젝트는 별도의 npm 패키지 설치가 필요하지 않습니다.

1. 프로젝트 폴더로 이동합니다.

```powershell
cd C:\Users\mediazen\Desktop\mzProject\JsonParse\web
```

2. 로컬 서버를 시작합니다.

```powershell
npm start
```

3. 브라우저에서 다음 주소를 열어보세요.

```text
http://localhost:3000/
```

다른 포트를 사용하려면 서버를 시작하기 전에 `PORT`를 설정합니다.

```powershell
$env:PORT=62628
npm start
```

이 경우 다음 주소를 엽니다.

```text
http://localhost:62628/
```

## 사용 방법

1. 붙여넣기 영역에 로그 텍스트 또는 JSON 텍스트를 붙여넣습니다.
2. 목록에 JSON 항목을 추가하려면 추출 및 등록 버튼을 클릭하세요.
3. 파일을 로드하려면 JSON 파일 선택기를 사용하여 하나 이상의 .json 파일을 선택하세요.
4. 목록에서 생성된 파일 이름을 확인하고 필요한 경우 편집합니다.
5. 영어 파일 이름이 필요한 경우 영어 번역 옵션을 활성화된 상태로 유지하세요.
6. 모두 다운로드 버튼을 클릭하시면 등록된 항목을 ZIP 파일로 저장하실 수 있습니다.

## 번역

영문 파일명 변환에서는 OpenAI API 키를 사용하지 않습니다. 로컬 서버는 무료 Google 번역 요청 URL을 호출하고 파일 이름에 대해서만 결과를 사용합니다.

- 인터넷 연결이 필요합니다.
- 번역이 실패하면 앱은 원본 텍스트를 기반으로 안전한 파일 이름을 유지하고 해당 항목에 대한 경고를 표시합니다.
- 번역은 파일 이름에만 적용됩니다. JSON 파일 내용은 변경되지 않습니다.

## DB 기반 Explorer

DB 기반 데이터 관리는 `/admin` 화면에서 수행합니다.

- JSON Explorer: dataset version과 country/region을 선택한 뒤 JSON 파일을 업로드합니다.
- Mapping Table Explorer: dataset version을 만들고 Mapping Table 엑셀 파일을 업로드합니다.
- String Resource Explorer: dataset version을 만들고 다국어 문자열 리소스 엑셀 파일을 업로드합니다.
- 일반 검색 화면에서는 업로드된 dataset을 선택해 DB 데이터를 조회할 수 있습니다.

필요한 환경변수:

```text
DATABASE_URL=Neon Postgres connection string
JSON_ADMIN_KEY=관리자 업로드/삭제에 사용할 비밀 키
```

초기 DB는 `db/schema.sql`을 Neon SQL Editor에서 실행해 구성합니다.

## 테스트

다음 명령을 실행하여 핵심 논리 및 서버 도우미를 테스트합니다.

```powershell
npm test
```
