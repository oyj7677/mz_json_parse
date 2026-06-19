export function getBrowserXlsx(root = globalThis) {
  const xlsx = root?.XLSX;
  if (typeof xlsx?.read !== 'function' || typeof xlsx?.utils?.sheet_to_json !== 'function') {
    throw new Error('SheetJS XLSX library is not loaded. Run npm run prepare:vendor and include ./vendor/xlsx.full.min.js.');
  }
  return xlsx;
}

export async function parseStringResourceWorkbookFile(file, root = globalThis) {
  const xlsx = getBrowserXlsx(root);
  const buffer = await file.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: 'array' });
  return convertSheetJsonToWorkbook(
    {
      SheetNames: workbook.SheetNames,
      Sheets: Object.fromEntries(
        workbook.SheetNames.map((name) => [
          name,
          xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, defval: '' })
        ])
      )
    },
    file.name
  );
}

export function convertSheetJsonToWorkbook(sheetJsonWorkbook, source) {
  const sheetNames = Array.isArray(sheetJsonWorkbook?.SheetNames) ? sheetJsonWorkbook.SheetNames : [];
  return {
    source,
    sheets: sheetNames.map((name) => ({
      name,
      rows: rowsToObjects(sheetJsonWorkbook.Sheets?.[name] ?? [])
    }))
  };
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const columnCount = rows.reduce(
    (maxColumnCount, row) => Math.max(maxColumnCount, Array.isArray(row) ? row.length : 0),
    0
  );
  const header = Array.from({ length: columnCount }, (_, index) => {
    const text = String(rows[0]?.[index] ?? '').trim();
    return text || `Column ${index + 1}`;
  });

  return rows.map((row, rowIndex) => ({
    rowNumber: rowIndex + 1,
    values: Object.fromEntries(
      header.map((columnName, columnIndex) => [
        columnName,
        row?.[columnIndex] ?? ''
      ])
    )
  }));
}
