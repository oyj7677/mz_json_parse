# String Resource ID Detail Interaction

## Goal

String Resource Explorer search results should prioritize string values and IDs. File and sheet metadata are useful for tracing a row, but they should not occupy primary table columns.

## Selected Design

Use the Resource ID as the detail trigger.

- Remove the `File`, `Sheet`, and current View/action columns from the String Resource result table.
- Render each `Resource ID` value as a compact button-like text control inside the first column.
- Clicking the ID opens the existing String Resource detail dialog.
- Keep File, Sheet, and row number visible in the dialog header metadata.
- Preserve the existing detail dialog behavior: Escape closes it, Tab focus stays inside it, and focus returns to the clicked ID after close.

## Table Layout

The table should become:

`Resource ID | ko | es-rMX | es-rES | en-rUS | en-rGB | en-rAU | ...`

Language columns remain controlled by the existing language column selector. The table still scrolls horizontally when many language columns are visible.

## Detail Dialog

The current dialog remains the single detail surface.

- Title: selected resource ID.
- Metadata: filename, sheet name, and source row number.
- Body: language values and raw row metadata as currently implemented.

## Empty And Error States

No new empty or error states are required. If a selected row disappears after sheet filtering or clearing uploads, the existing stale-row close behavior still closes the dialog.

## Testing

Update UI structure tests to assert:

- String Resource table headers no longer include `File`, `Sheet`, or the View/action column.
- Resource ID cells render a clickable detail trigger.
- The ID trigger calls `openStringResourceDetail(row.id)`.
- Existing modal focus and stale-row close contracts remain covered.
