import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertMappingSheetJsonToWorkbook,
  getMappingXlsx,
  parseMappingWorkbookFile
} from '../public/mapping-table-xlsx.js';

describe('mapping-table-xlsx', () => {
  it('converts SheetJS array rows to workbook sheet row objects', () => {
    const workbook = convertMappingSheetJsonToWorkbook(
      {
        SheetNames: ['GROUP INTENTIONS', 'SLOT REFERENCE'],
        Sheets: {
          'GROUP INTENTIONS': [
            ['Domain', 'Intention'],
            ['vehicle', 'turn_on_ac']
          ],
          'SLOT REFERENCE': [
            ['slot', 'value'],
            ['temperature', 'low']
          ]
        }
      },
      'mapping.xlsx'
    );

    assert.deepEqual(workbook, {
      source: 'mapping.xlsx',
      sheets: [
        {
          name: 'GROUP INTENTIONS',
          rows: [
            { rowNumber: 1, values: { Domain: 'Domain', Intention: 'Intention' } },
            { rowNumber: 2, values: { Domain: 'vehicle', Intention: 'turn_on_ac' } }
          ]
        },
        {
          name: 'SLOT REFERENCE',
          rows: [
            { rowNumber: 1, values: { slot: 'slot', value: 'value' } },
            { rowNumber: 2, values: { slot: 'temperature', value: 'low' } }
          ]
        }
      ]
    });
  });

  it('fills blank headers with stable column names and preserves missing cells', () => {
    const workbook = convertMappingSheetJsonToWorkbook(
      {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: [
            ['Domain', '', 'Note'],
            ['vehicle', undefined, 'ok'],
            ['media']
          ]
        }
      },
      'mapping.xlsx'
    );

    assert.deepEqual(workbook.sheets[0].rows, [
      { rowNumber: 1, values: { Domain: 'Domain', 'Column 2': '', Note: 'Note' } },
      { rowNumber: 2, values: { Domain: 'vehicle', 'Column 2': '', Note: 'ok' } },
      { rowNumber: 3, values: { Domain: 'media', 'Column 2': '', Note: '' } }
    ]);
  });

  it('parses a selected workbook file through the SheetJS browser adapter', async () => {
    const readCalls = [];
    const file = {
      name: 'mapping.xlsx',
      async arrayBuffer() {
        return new ArrayBuffer(4);
      }
    };
    const root = {
      XLSX: {
        read(buffer, options) {
          readCalls.push({ buffer, options });
          return {
            SheetNames: ['GROUP INTENTIONS'],
            Sheets: {
              'GROUP INTENTIONS': 'sheet-ref'
            }
          };
        },
        utils: {
          sheet_to_json(sheet, options) {
            assert.equal(sheet, 'sheet-ref');
            assert.deepEqual(options, { header: 1, blankrows: false, defval: '' });
            return [
              ['Domain', 'Intention'],
              ['vehicle', 'turn_on_ac']
            ];
          }
        }
      }
    };

    const workbook = await parseMappingWorkbookFile(file, root);

    assert.equal(readCalls.length, 1);
    assert.deepEqual(readCalls[0].options, { type: 'array' });
    assert.equal(workbook.source, 'mapping.xlsx');
    assert.equal(workbook.sheets[0].rows[1].values.Intention, 'turn_on_ac');
  });

  it('reports when SheetJS is unavailable', () => {
    assert.throws(
      () => getMappingXlsx({}),
      /SheetJS XLSX library is not loaded/
    );
  });
});
