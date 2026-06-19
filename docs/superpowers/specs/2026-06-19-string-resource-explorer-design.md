# String Resource Explorer Design

## Summary

String Resource Explorer is a new tool in the MZ Tools hub for searching multilingual string resource workbooks. Users upload one or more Excel files, the browser parses them locally, and the tool lets users search by visible string content while still matching resource IDs. Search results are shown as one row per resource ID, with Android string resource qualifier columns such as `ko`, `en-rUS`, `en-rGB`, `en-rAU`, `es-rMX`, and `es-rES`.

The first version is upload-based only. It will not inject resources into product code and will not store uploaded data on a server. Future DB integration can add server-side sources later without changing the core search experience.

## Goals

- Add a fourth hub tool named `String Resource Explorer`.
- Let users upload multiple `.xlsx` files.
- Parse workbooks in the browser so files are not uploaded to the server.
- Automatically detect likely string-resource sheets, then let users adjust selected sheets.
- Search primarily by string content across all language columns.
- Also include resource ID columns in the search index.
- Show results as `Resource ID | File | Sheet | ko | en-rUS | en-rGB | en-rAU | es-rMX | es-rES | ... | 보기`.
- Normalize language headers to Android string resource qualifier names.
- Provide a detail view for all language values, source metadata, and original row fields.

## Non-Goals

- No product-code injection.
- No strings XML generation in this first version.
- No server-side file upload or persistence.
- No DB-backed search in this first version.
- No default grouping of duplicate IDs across files. Duplicate IDs appear as separate rows per file and sheet.

## Source Data

The tool should support workbooks similar to these current examples:

- `New VR language library_Ver.*.xlsx`
  - Relevant sheet: `VR`
  - Typical columns: `MOBIS LID`, `HMC UID`, `Component`, `Mgr`, `Region`, `Note`, `Korean`, `English US`, `Spanish (Mexico)`, and other language columns.
- `VR language library_HMC_*.xlsx`
  - Relevant sheets include prompt, hotkey, on-screen text, and keyword sheets.
  - Typical columns: `String ID`, region/layout metadata, and many language columns.
- `ConnectC_Standard_Master_DB_*.xlsx`
  - Relevant sheets can be module sheets and new/finished translation sheets.
  - Typical columns: `ID`, `모듈`, `Description`, `values-ko`, `values-en-rUS`, `values-es-rMX`, and other `values-*` columns.

The parser should tolerate workbook variations. It should not depend on fixed sheet names only.

## Sheet Detection

After upload, each workbook is analyzed sheet by sheet.

A sheet is selected by default when it appears to contain:

- At least one resource ID column, such as `MOBIS LID`, `HMC UID`, `String ID`, `PromptLID`, `CheckLID`, or `ID`.
- At least one language/value column that can be mapped to an Android qualifier.

Sheets such as `History`, `Info`, `Revision`, update logs, and completion status sheets should usually be excluded by automatic detection because they lack language resource columns.

The user can correct automatic detection with a sheet selection panel. The panel should show files, sheets, detected row counts, and whether the sheet was auto-selected.

## Language Normalization

Language columns should be displayed with Android string resource qualifier names, not raw Excel headers.

Required examples:

- `Korean`, `values-ko` -> `ko`
- `English US`, `values-en-rUS` -> `en-rUS`
- `English UK`, `English GB`, `values-en-rGB` -> `en-rGB`
- `English AU`, `values-en-rAU` -> `en-rAU`
- `Spanish (Mexico)`, `values-es-rMX` -> `es-rMX`
- `Spanish (Spain)`, `values-es-rES` -> `es-rES`
- `French (Canada)`, `values-fr-rCA` -> `fr-rCA`
- `Portuguese (Brazil)`, `values-pt-rBR` -> `pt-rBR`
- `Chinese (Simplified, China)`, `values-zh-rCN` -> `zh-rCN`

The default visible column order is:

`ko`, `en-rUS`, `en-rGB`, `en-rAU`, `es-rMX`, `es-rES`, `fr-rCA`, `pt-rBR`, `zh-rCN`

Additional detected languages should appear after the default list in stable qualifier order.

## Search Model

The search box is content-first. The user usually searches for visible strings, not IDs.

The search index includes:

- All normalized language values.
- Resource ID values.

The first version should reuse the existing search grammar where practical:

- Space or plain text matches a term.
- `,` combines terms with AND.
- `|` combines terms with OR.
- `*` acts as a wildcard.

The result unit is a resource row, not a matched cell. If any language value or ID in a row matches, that resource row appears once.

## Result Table

The table should prioritize scanning and language comparison.

Required columns:

- `Resource ID`
- `File`
- `Sheet`
- Language columns using Android qualifiers
- `보기`

The table should support horizontal scrolling because language columns can be wide and numerous. A language column control should let users choose which qualifier columns are visible.

When the same resource ID appears in several uploaded files or sheets, each source appears as a separate row. This keeps source tracing simple for the first version.

## Detail View

Clicking `보기` opens a detail view for the selected resource row.

The detail view should show:

- Resource ID fields found in the row.
- All normalized language values.
- File name.
- Sheet name.
- Original row number.
- Useful metadata such as component, region, note, module, description, app name, or screen ID when available.
- Original row fields in a collapsed or secondary section.

The detail view should include copy buttons for language values where practical.

## Data Flow

1. User opens `String Resource Explorer` from the tool hub.
2. User uploads one or more Excel files.
3. Browser parses the workbook files.
4. Parser extracts sheet summaries and detects candidate resource sheets.
5. User optionally adjusts selected sheets.
6. Parser normalizes selected sheets into resource rows.
7. Search index is built from ID fields and normalized language values.
8. Results render as one resource row per source row.
9. Detail view reads the selected normalized row.

## Error Handling

- Unsupported or unreadable files should be reported per file without clearing successfully loaded files.
- Sheets with no recognizable ID or language columns should be visible in the sheet selector but unselected by default.
- Empty search should show a neutral state rather than all rows by default, to avoid overwhelming the browser.
- Rows missing a resource ID should use a stable fallback label based on file, sheet, and row number.
- Duplicate qualifiers in one row should be preserved internally and displayed in a predictable way, preferring the first non-empty value for the table and showing all raw fields in detail.

## Testing

Add focused tests for:

- Language header normalization to Android qualifiers.
- Default qualifier ordering.
- Workbook/sheet normalization across sample VR, HMC, and ConnectC-shaped fixtures.
- Automatic sheet detection.
- Content-first search across language values.
- ID search still matching rows.
- Duplicate ID rows appearing separately per file.
- UI structure for the new hub card, upload controls, sheet selector, result table, and detail view.

## Future Extensions

- Same-ID grouping across files and versions.
- Server-side DB source integration.
- Export selected rows to CSV or Excel.
- Generate Android `strings.xml` preview.
- Compare two uploaded versions by qualifier and resource ID.
