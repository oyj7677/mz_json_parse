# String Resource Fullscreen Upload Overlay Design

## Status
Approved by user selection on 2026-06-19: Option A, fullscreen dim overlay with centered circular progress.

## Goal
When String Resource Excel files are uploading and being parsed, the app should make the temporary blocking state unmistakable. Because the user cannot use the page during this operation, the UI will dim the full viewport and show a centered circular progress indicator with the current phase and file progress.

## User Experience
- On upload start, show a fullscreen overlay above the current page.
- The page behind the overlay becomes a light gray dimmed background.
- The overlay card appears in the center and includes:
  - Circular progress indicator.
  - Percent value.
  - Primary status text such as `엑셀 분석 중`.
  - Secondary progress text such as `7/12 분석 중 - filename.xlsx`.
- The overlay has no close or cancel button because the current upload flow cannot safely cancel parsing midway.
- On upload completion, hide the overlay and return the user to the normal String Resource Explorer screen.
- If some files fail and others succeed, the overlay still closes after processing all selected files and the existing upload status text reports success/error counts.

## Scope
This change applies only to the String Resource Explorer Excel upload flow.
Existing JSON Formatter, JSON Explorer, Mapping Table Explorer, and inline upload status behaviors should remain unchanged unless they are directly shared styles.

## Component And State Changes
- Reuse the existing upload progress state values: completed count, total count, current file name, phase, and percent.
- Add fullscreen overlay DOM inside the String Resource app section or near the app root so it can cover the viewport reliably.
- Keep `state.stringResource.isUploading` as the source for disabled controls.
- Update the existing progress helpers so they drive both accessibility values and the fullscreen overlay display.

## Accessibility
- Use `role="status"` and `aria-live="polite"` for progress status text.
- Use `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` for the circular progress indicator.
- Because the overlay is blocking, pointer interaction with the background should be prevented while it is visible.
- The overlay should not trap focus with modal controls because there are no actionable controls inside it; upload controls are already disabled.

## Visual Rules
- The dim layer should be light gray and semi-transparent, not dark.
- The centered card should be compact, utility-style, and consistent with the existing 8px radius design language.
- Circular progress should use the app blue color and a muted track color.
- Long file names should be truncated with ellipsis rather than expanding the card.
- The design must fit desktop and mobile viewports without text overlap.

## Error Handling
- If parsing throws for one file, keep processing remaining files.
- The overlay progress count advances for both successful and failed files.
- After all files are processed, hide the overlay and render the normal result/error summary.

## Testing
- Update UI structure tests to require the fullscreen upload overlay elements and CSS selectors.
- Keep existing upload helper tests passing.
- Verify `node --check public/app.js`, `node --test --test-isolation=none`, and `git diff --check`.
- Browser-smoke the local page to confirm the overlay is hidden at idle and can be shown by the progress helper state.
