# String Resource Upload Progress Design

## Goal

Excel upload in String Resource Explorer should give clear feedback while multiple workbook files are being read, parsed, normalized, and registered.

## Selected Design

Add a compact progress bar inside the String Resource upload toolbar.

- Show the progress UI only while files are being processed.
- Track progress by file count: completed files divided by total selected files.
- Show the current file name and step text, such as `2/6 processing - workbook.xlsx`.
- Keep parsing resilient: if one file fails, record the error and continue with the next file.
- Disable upload-related controls while processing to prevent duplicate registration or state clearing mid-upload.
- Hide the progress UI when processing finishes and restore the normal status text.

## Progress Semantics

The browser can measure file-level progress reliably. It cannot reliably measure row-level progress while SheetJS parses a workbook synchronously. Therefore, the visible percentage is file-based.

Progress states:

- Idle: progress UI hidden, normal upload status visible.
- Starting: progress UI visible at 0 percent with total file count.
- Processing: progress UI updates before each file and after each file.
- Complete: status text shows registered file count and error count, progress UI hidden.

## Controls

During upload processing:

- Disable the Excel file picker trigger.
- Disable the language column button.
- Disable the clear list button.
- Keep existing uploaded data visible until newly selected files finish adding.

## Accessibility

- The progress wrapper uses `role="status"` and `aria-live="polite"`.
- The visual bar has `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`.
- The text label includes the numeric count and current filename.

## Testing

Update UI structure tests to assert:

- Progress DOM exists in String Resource toolbar.
- App code queries progress elements.
- Upload flow calls progress update helpers before, during, and after processing.
- Upload controls are disabled while processing.
- CSS includes progress bar, fill, and status text styles.
