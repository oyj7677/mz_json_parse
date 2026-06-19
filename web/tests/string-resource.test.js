import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertSheetJsonToWorkbook,
  getBrowserXlsx,
  parseStringResourceWorkbookFile
} from '../public/string-resource-xlsx.js';
import {
  STRING_RESOURCE_DEFAULT_QUALIFIERS,
  detectStringResourceSheet,
  filterStringResourceRows,
  normalizeStringResourceQualifier,
  normalizeStringResourceWorkbook,
  resolveStringResourceQualifiers
} from '../public/string-resource-core.js';

const sampleWorkbook = {
  source: 'sample.xlsx',
  sheets: [
    {
      name: 'History',
      rows: [
        { rowNumber: 1, values: { Version: 'V248', LID: 'CID_OLD', 'Contents (Korean)': '변경 이력' } }
      ]
    },
    {
      name: 'VR',
      rows: [
        {
          rowNumber: 1,
          values: {
            'MOBIS LID': 'MOBIS LID',
            'HMC UID': 'HMC UID',
            Component: 'Component',
            Korean: 'Korean',
            'English US': 'English US',
            'Spanish (Mexico)': 'Spanish (Mexico)',
            'French (Canada)': 'French (Canada)'
          }
        },
        {
          rowNumber: 2,
          values: {
            'MOBIS LID': 'CID_CMN_COMM_01_01_G',
            'HMC UID': 'UID_00107629_00',
            Component: 'Keyword',
            Korean: '도움말',
            'English US': 'Help.',
            'Spanish (Mexico)': 'Ayuda.',
            'French (Canada)': 'Aide.'
          }
        },
        {
          rowNumber: 3,
          values: {
            'MOBIS LID': 'CID_CMN_COMM_01_02_G',
            'HMC UID': 'UID_00107001_00',
            Component: 'Keyword',
            Korean: '전체 기능',
            'English US': 'Commands.',
            'Spanish (Mexico)': 'Comandos.',
            'French (Canada)': 'Commandes.'
          }
        }
      ]
    },
    {
      name: 'ConnectC',
      rows: [
        {
          rowNumber: 1,
          values: {
            ID: 'ID',
            'values-ko': 'values-ko',
            'values-en-rUS': 'values-en-rUS',
            'values-es-rMX': 'values-es-rMX',
            Description: 'Description'
          }
        },
        {
          rowNumber: 2,
          values: {
            ID: 'HMTC_Seat_00000159_00',
            'values-ko': '전신 스트레칭',
            'values-en-rUS': 'Full Body Stretch',
            'values-es-rMX': 'Estiramiento Cuerpo Entero',
            Description: '마사지 모드'
          }
        }
      ]
    }
  ]
};

describe('String Resource XLSX adapter', () => {
  it('converts SheetJS row arrays into normalized workbook sheets', () => {
    const result = convertSheetJsonToWorkbook(
      {
        SheetNames: ['VR', 'Empty'],
        Sheets: {
          VR: [
            ['', ' MOBIS LID ', 'English US'],
            ['Header note', 'CID_001', 'Help.'],
            [undefined, 'CID_002', undefined]
          ],
          Empty: []
        }
      },
      'sample.xlsx'
    );

    assert.deepEqual(result, {
      source: 'sample.xlsx',
      sheets: [
        {
          name: 'VR',
          rows: [
            {
              rowNumber: 1,
              values: { 'Column 1': '', 'MOBIS LID': ' MOBIS LID ', 'English US': 'English US' }
            },
            {
              rowNumber: 2,
              values: { 'Column 1': 'Header note', 'MOBIS LID': 'CID_001', 'English US': 'Help.' }
            },
            {
              rowNumber: 3,
              values: { 'Column 1': '', 'MOBIS LID': 'CID_002', 'English US': '' }
            }
          ]
        },
        { name: 'Empty', rows: [] }
      ]
    });
  });

  it('parses an uploaded workbook file through SheetJS row arrays', async () => {
    const buffer = new ArrayBuffer(4);
    const calls = [];
    const root = {
      XLSX: {
        read(input, options) {
          calls.push(['read', input, options]);
          return {
            SheetNames: ['VR'],
            Sheets: { VR: { marker: 'sheet' } }
          };
        },
        utils: {
          sheet_to_json(sheet, options) {
            calls.push(['sheet_to_json', sheet, options]);
            return [
              ['MOBIS LID', 'English US'],
              ['CID_001', 'Help.']
            ];
          }
        }
      }
    };

    const result = await parseStringResourceWorkbookFile(
      { name: 'strings.xlsx', arrayBuffer: async () => buffer },
      root
    );

    assert.deepEqual(calls, [
      ['read', buffer, { type: 'array' }],
      ['sheet_to_json', { marker: 'sheet' }, { header: 1, blankrows: false, defval: '' }]
    ]);
    assert.deepEqual(result, {
      source: 'strings.xlsx',
      sheets: [
        {
          name: 'VR',
          rows: [
            { rowNumber: 1, values: { 'MOBIS LID': 'MOBIS LID', 'English US': 'English US' } },
            { rowNumber: 2, values: { 'MOBIS LID': 'CID_001', 'English US': 'Help.' } }
          ]
        }
      ]
    });
  });

  it('throws a clear error when SheetJS is missing', () => {
    assert.throws(() => getBrowserXlsx({}), /SheetJS XLSX library is not loaded/);
    assert.throws(
      () => getBrowserXlsx({ XLSX: { read() {}, utils: {} } }),
      /SheetJS XLSX library is not loaded/
    );
  });
});

describe('String Resource Explorer helpers', () => {
  it('normalizes Excel language headers to Android resource qualifiers', () => {
    assert.equal(normalizeStringResourceQualifier('Korean'), 'ko');
    assert.equal(normalizeStringResourceQualifier('English US'), 'en-rUS');
    assert.equal(normalizeStringResourceQualifier('English UK'), 'en-rGB');
    assert.equal(normalizeStringResourceQualifier('English AU'), 'en-rAU');
    assert.equal(normalizeStringResourceQualifier('Spanish (Mexico)'), 'es-rMX');
    assert.equal(normalizeStringResourceQualifier('Spanish (Spain)'), 'es-rES');
    assert.equal(normalizeStringResourceQualifier('French (Canada)'), 'fr-rCA');
    assert.equal(normalizeStringResourceQualifier('Portuguese (Brazil)'), 'pt-rBR');
    assert.equal(normalizeStringResourceQualifier('Chinese (Simplified, China)'), 'zh-rCN');
    assert.equal(normalizeStringResourceQualifier('values-en-rUS'), 'en-rUS');
    assert.equal(normalizeStringResourceQualifier('Description'), '');
  });

  it('keeps a fixed default qualifier order', () => {
    assert.deepEqual(STRING_RESOURCE_DEFAULT_QUALIFIERS.slice(0, 9), [
      'ko',
      'en-rUS',
      'en-rGB',
      'en-rAU',
      'es-rMX',
      'es-rES',
      'fr-rCA',
      'pt-rBR',
      'zh-rCN'
    ]);
  });

  it('detects string resource sheets and excludes history-like sheets', () => {
    const [history, vr, connect] = sampleWorkbook.sheets;
    assert.equal(detectStringResourceSheet(history).isCandidate, false);
    assert.equal(detectStringResourceSheet(vr).isCandidate, true);
    assert.deepEqual(detectStringResourceSheet(vr).idColumns, ['MOBIS LID', 'HMC UID']);
    assert.deepEqual(detectStringResourceSheet(connect).languageColumns.map((column) => column.qualifier), [
      'ko',
      'en-rUS',
      'es-rMX'
    ]);
  });

  it('detects PromptLID and CheckLID sheets as string resource candidates', () => {
    const promptSummary = detectStringResourceSheet({
      name: 'Prompts',
      rows: [{ rowNumber: 2, values: { PromptLID: 'CID_PROMPT_001', Korean: '도움말' } }]
    });
    const checkSummary = detectStringResourceSheet({
      name: 'Checks',
      rows: [{ rowNumber: 2, values: { CheckLID: 'CID_CHECK_001', 'English US': 'Help.' } }]
    });

    assert.equal(promptSummary.isCandidate, true);
    assert.deepEqual(promptSummary.idColumns, ['PromptLID']);
    assert.equal(checkSummary.isCandidate, true);
    assert.deepEqual(checkSummary.idColumns, ['CheckLID']);
  });

  it('normalizes workbook rows as one resource row per source row', () => {
    const result = normalizeStringResourceWorkbook(sampleWorkbook, 'sample.xlsx');
    assert.equal(result.rows.length, 3);
    assert.deepEqual(
      result.rows.map((row) => [row.resourceId, row.fileName, row.sheetName, row.rowNumber]),
      [
        ['CID_CMN_COMM_01_01_G', 'sample.xlsx', 'VR', 2],
        ['CID_CMN_COMM_01_02_G', 'sample.xlsx', 'VR', 3],
        ['HMTC_Seat_00000159_00', 'sample.xlsx', 'ConnectC', 2]
      ]
    );
    assert.deepEqual(result.rows[0].idFields, {
      'MOBIS LID': 'CID_CMN_COMM_01_01_G',
      'HMC UID': 'UID_00107629_00'
    });
    assert.deepEqual(result.rows[0].duplicateLanguages, {});
    assert.equal(result.rows[0].originalValues.Korean, '도움말');
    assert.equal(result.rows[0].languages.ko, '도움말');
    assert.equal(result.rows[0].languages['en-rUS'], 'Help.');
    assert.equal(result.rows[0].languages['es-rMX'], 'Ayuda.');
    assert.equal(result.rows[2].metadata.Description, '마사지 모드');
  });

  it('filters by visible string content and by resource ID', () => {
    const { rows } = normalizeStringResourceWorkbook(sampleWorkbook, 'sample.xlsx');
    assert.deepEqual(filterStringResourceRows(rows, '도움말').map((row) => row.resourceId), [
      'CID_CMN_COMM_01_01_G'
    ]);
    assert.deepEqual(filterStringResourceRows(rows, 'Full Body').map((row) => row.resourceId), [
      'HMTC_Seat_00000159_00'
    ]);
    assert.deepEqual(filterStringResourceRows(rows, 'CID_CMN*|HMTC_Seat*').map((row) => row.resourceId), [
      'CID_CMN_COMM_01_01_G',
      'CID_CMN_COMM_01_02_G',
      'HMTC_Seat_00000159_00'
    ]);
    assert.deepEqual(filterStringResourceRows(rows, 'Keyword, Commands').map((row) => row.resourceId), [
      'CID_CMN_COMM_01_02_G'
    ]);
  });

  it('keeps duplicate IDs as separate source rows', () => {
    const duplicateWorkbook = {
      source: 'dup.xlsx',
      sheets: [
        {
          name: 'VR',
          rows: [
            { rowNumber: 2, values: { 'MOBIS LID': 'CID_DUP', Korean: '도움말', 'English US': 'Help.' } },
            { rowNumber: 3, values: { 'MOBIS LID': 'CID_DUP', Korean: '도움말 변경', 'English US': 'Help updated.' } }
          ]
        }
      ]
    };
    const { rows } = normalizeStringResourceWorkbook(duplicateWorkbook, 'dup.xlsx');
    assert.deepEqual(rows.map((row) => row.id), ['dup.xlsx:VR:2', 'dup.xlsx:VR:3']);
  });

  it('preserves duplicate language values while preferring the first table value', () => {
    const duplicateLanguageWorkbook = {
      source: 'duplicate-language.xlsx',
      sheets: [
        {
          name: 'VR',
          rows: [
            {
              rowNumber: 2,
              values: {
                'MOBIS LID': 'CID_DUP_LANG',
                'English US': 'Help.',
                'values-en-rUS': 'Assistance.'
              }
            }
          ]
        }
      ]
    };

    const { rows } = normalizeStringResourceWorkbook(duplicateLanguageWorkbook, 'duplicate-language.xlsx');

    assert.equal(rows[0].languages['en-rUS'], 'Help.');
    assert.deepEqual(rows[0].duplicateLanguages['en-rUS'], [
      { column: 'English US', value: 'Help.' },
      { column: 'values-en-rUS', value: 'Assistance.' }
    ]);
  });

  it('orders detected qualifiers after fixed defaults', () => {
    const qualifiers = resolveStringResourceQualifiers([
      { languages: { 'es-rMX': 'Ayuda.', ko: '도움말', 'en-rUS': 'Help.', 'it-rIT': 'Aiuto.' } }
    ]);
    assert.deepEqual(qualifiers, ['ko', 'en-rUS', 'es-rMX', 'it-rIT']);
  });
});
