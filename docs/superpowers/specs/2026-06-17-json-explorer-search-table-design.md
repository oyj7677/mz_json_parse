# JSON Explorer Search Table UX Design

## Goal

JSON Explorer를 업로드 목록 중심 화면에서 검색 중심 화면으로 바꾼다. 사용자는 여러 JSON 파일을 등록한 뒤, `recognitionText`와 주요 추출 값을 테이블에서 빠르게 검색하고 필요한 JSON만 모달로 확인한다.

## Confirmed UX Decisions

- 기본 화면은 검색 중심이다.
- 검색어가 비어 있으면 결과 목록을 보여주지 않는다.
- 상단에는 등록된 파일 수만 명확하게 표시한다.
- 업로드 영역은 상단 작은 툴바로 축소한다.
- 등록 파일 목록은 `등록 파일 보기` 버튼을 눌렀을 때 오른쪽 사이드 패널로 연다.
- 등록 파일 패널 항목은 파일명, `recognitionText`, 삭제 버튼만 보여준다.
- 검색 결과는 표 형식으로 보여준다.
- 표는 내부 스크롤을 사용해서 상단 툴바와 검색창이 화면에 남도록 한다.
- JSON 원문은 표의 `보기` 버튼을 눌렀을 때 모달로 보여준다.
- 검색어 입력 시 `recognitionText` 기반 추천 검색어를 보여준다.

## Layout

### Header

상단 헤더는 `JSON Explorer` 제목과 도구 목록 이동 버튼을 유지한다.

### Toolbar

검색 화면 바로 위에 작은 툴바를 둔다.

- `JSON 파일 선택`
- `JSON 폴더 선택`
- `등록된 파일 N개`
- `검색 결과 M개`
- `등록 파일 보기`
- `목록 비우기`

업로드 상태 메시지는 툴바 안에서 작게 표시한다.

### Search Area

검색창은 화면 중심 액션이다.

- 라벨: `통합 검색`
- placeholder: `recognitionText, 파일명, slot, contentType 등으로 검색`
- 검색어가 없을 때 안내: `recognitionText 또는 파일명 등으로 검색하세요.`

### Results Table

검색어가 있을 때만 테이블을 표시한다.

기본 컬럼:

| Column | Source |
| --- | --- |
| 파일명 | 업로드된 파일명 |
| recognitionText | JSON 안의 `recognitionText` |
| language | 최상단 `language` |
| slot | `slots` 배열의 이름과 값 요약 |
| contentType | `serverResult.result.contentType` |
| table_version | `serverResult.result.table_version` |
| 보기 | JSON 원문 모달 버튼 |

`slot` 컬럼은 `slotName=value` 형식으로 보여준다. 여러 개면 `, `로 연결한다. 값이 없으면 `-`를 표시한다.

## Search Behavior

검색 대상은 표에 보이는 모든 컬럼이다.

- 파일명
- `recognitionText`
- `language`
- `slot`
- `contentType`
- `table_version`

검색은 대소문자를 구분하지 않는다.

검색어에 `,`가 포함되면 쉼표로 조건을 나누고 AND 검색한다.

예:

- `weather,en_AU`는 두 조건이 모두 같은 행의 표시 컬럼 중 어딘가에 있어야 한다.
- `Weather,3.3.15,location=Sydney`는 세 조건을 모두 만족하는 행만 보여준다.

검색 결과가 없으면 다음 문구를 보여준다.

`다음 조건을 모두 만족하는 결과가 없습니다: weather, en_US`

## Search Suggestions

추천 검색어는 업로드된 항목의 `recognitionText`를 기반으로 한다.

- 검색창 입력 시 추천 목록을 표시한다.
- 추천은 최대 8개 표시한다.
- 추천 항목은 `recognitionText`와 파일명을 함께 보여준다.
- 추천 클릭 시 검색창에 해당 `recognitionText`를 입력하고 즉시 검색한다.
- 쉼표 조합 검색 중이면 마지막 조건만 추천값으로 교체한다.

예:

- 입력값: `weather, nav`
- 추천 선택: `Navigate to home`
- 결과 입력값: `weather, Navigate to home`

## Registered Files Drawer

`등록 파일 보기` 버튼을 누르면 오른쪽 사이드 패널을 연다.

패널 내용:

- 파일명
- `recognitionText` 한 줄 요약
- 삭제 버튼

삭제 시:

- 등록 파일 수를 갱신한다.
- 검색 결과에서 해당 행을 제거한다.
- 해당 파일의 JSON 모달이 열려 있으면 모달을 닫는다.

## JSON Detail Modal

표의 `보기` 버튼을 누르면 JSON 원문 모달을 연다.

모달 내용:

- 제목: `recognitionText`, 없으면 파일명
- 보조 정보: 파일명, `language`, `contentType`, `table_version`
- 본문: 포맷팅된 JSON 원문
- 닫기 버튼

모달은 표 위에 뜨며, 닫으면 검색 결과 화면으로 돌아온다.

## Empty States

- 등록 파일 0개: `JSON 파일 또는 폴더를 먼저 등록하세요.`
- 등록 파일 있음, 검색어 없음: `recognitionText 또는 파일명 등으로 검색하세요.`
- 검색 결과 없음: `다음 조건을 모두 만족하는 결과가 없습니다: ...`

## Non-Goals

- 이번 단계에서는 CSV/Excel 다운로드를 만들지 않는다.
- 이번 단계에서는 사용자가 컬럼을 직접 추가하는 기능을 만들지 않는다.
- 이번 단계에서는 검색 추천에 `language`나 `contentType`을 붙이지 않는다. 추천은 `recognitionText + 파일명`만 사용한다.
- JSON Formatter 화면은 바꾸지 않는다.

## Testing Strategy

- core helper 테스트로 metadata 추출, slot 요약, 콤마 AND 검색, 추천 검색어 생성을 검증한다.
- UI 구조 테스트로 검색 중심 레이아웃, 툴바, 테이블, 모달, 등록 파일 패널의 필수 DOM을 검증한다.
- 수동 브라우저 확인으로 업로드 후 검색, 추천 선택, 모달 보기, 등록 파일 패널 삭제 흐름을 확인한다.
