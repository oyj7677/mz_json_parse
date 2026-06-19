# String Resource Sheet Tree Selector

## Goal

The String Resource Explorer can receive workbooks with many sheets. The current flat sheet checklist can grow beyond the visible panel and is hard to scan. The sheet selector should behave more like an IDE package tree: files are parent nodes, sheets are child nodes, and the whole selector scrolls inside its panel.

## Selected Design

Use a scrollable `File > Sheet` tree selector.

- Keep the existing sheet selection data model based on `selectedSheetIds`.
- Render each uploaded file as a parent tree node.
- Render each workbook sheet as a child checkbox row under its file.
- Make the sheet tree area scroll vertically when the list is taller than the available panel.
- Keep search results updated immediately when a file or sheet checkbox changes.

## File Nodes

Each file node shows:

- Expand/collapse control.
- File-level checkbox.
- File name.
- Selected sheet count and total sheet count, such as `3/12`.

The file-level checkbox controls every sheet in that file:

- Checked: all sheets in the file are selected.
- Unchecked: no sheets in the file are selected.
- Indeterminate: some sheets in the file are selected.

Default expansion:

- Files containing automatically detected candidate sheets start expanded.
- Files without selected candidate sheets may start collapsed.

## Sheet Nodes

Each sheet row shows:

- Sheet-level checkbox.
- Sheet name.
- Row count.
- Detection label: auto detected or manually selectable.

Toggling a sheet updates only that sheet's `selectedSheetIds` entry.

## Scrolling

The sheet selector must have a real scroll region.

- The sheet panel keeps its header visible above the tree.
- The tree body uses `overflow-y: auto`.
- On desktop, the tree body should use the available vertical space without forcing the entire app layout to overflow.
- On narrow screens, the tree remains usable as a bounded scroll area.

## Accessibility

- File expand/collapse buttons expose `aria-expanded`.
- File-level and sheet-level controls use normal checkbox inputs.
- The indeterminate state is set on the file checkbox DOM node.
- Labels remain clickable.

## Testing

Update UI structure tests to assert:

- The sheet selector renders tree-related classes and controls.
- File nodes expose expand/collapse behavior.
- The sheet tree body has `overflow-y: auto`.
- File-level toggles can select or deselect every sheet in one file.
- The existing `selectedSheetIds` filtering contract remains unchanged.
