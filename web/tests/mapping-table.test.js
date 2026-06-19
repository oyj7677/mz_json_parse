import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../public/core.js';

const sampleWorkbook = {
  generatedAt: '2026-06-18T00:00:00.000Z',
  source: 'Mapping table_v3.3.19.xlsx',
  sheets: [
    {
      name: 'GROUP INTENTIONS',
      rows: [
        {
          rowNumber: 2,
          values: {
            '도메인': 'Media',
            '대표 명령어': 'Next / Next radio station',
            '발화 패턴': 'Next station',
            '매핑 인텐션(=contentType)': 'ServerPlayRadio',
            Domain: 'media',
            Intention: 'media:na:channel',
            'Slot 1': 'Home',
            'Slot 2': 'Passenger',
            'Slot 3': '-',
            'Slot4': 'Home',
            비고: 'radio next command'
          }
        }
      ]
    },
    {
      name: 'SLOT REFERENCE',
      rows: [
        {
          rowNumber: 5,
          values: {
            'Slot Reference': 'Home',
            'Slot name': 'environment',
            'Slot Value': 'البيت',
            'Slot Canonical': 'home',
            '발화 패턴': 'إلى البيت من فضلك'
          }
        },
        {
          rowNumber: 6,
          values: {
            'Slot Reference': 'Passenger',
            'Slot name': 'position',
            'Slot Value': 'passenger',
            'Slot Canonical': 'passenger',
            '발화 패턴': 'passenger side'
          }
        },
        {
          rowNumber: 7,
          values: {
            'Slot Reference': 'Other',
            'Slot name': 'position',
            'Slot Value': 'other',
            'Slot Canonical': 'other',
            '발화 패턴': 'other side'
          }
        }
      ]
    },
    {
      name: '매핑 테이블',
      rows: [
        {
          rowNumber: 8,
          values: {
            Domain: 'music',
            Intention: 'mediamusic:play:song',
            부가정보: '(NoCinemo Auth)',
            '매핑 인텐션': 'MusicStream',
            비고: '20240311 추가'
          }
        }
      ]
    }
  ]
};

describe('Mapping Table Explorer helpers', () => {
  it('normalizes workbook sheets into searchable rows with summaries', () => {
    assert.equal(typeof core.normalizeMappingWorkbook, 'function');

    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    assert.equal(rows.length, 5);
    assert.deepEqual(
      rows.map((row) => [row.sheetName, row.rowNumber, row.primaryText, row.mappingIntent]),
      [
        ['GROUP INTENTIONS', 2, 'Next / Next radio station', 'ServerPlayRadio'],
        ['SLOT REFERENCE', 5, 'Home', ''],
        ['SLOT REFERENCE', 6, 'Passenger', ''],
        ['SLOT REFERENCE', 7, 'Other', ''],
        ['매핑 테이블', 8, 'mediamusic:play:song', 'MusicStream']
      ]
    );
  });

  it('maps shared checkbox categories to different sheet columns', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    const utteranceMatches = core.filterMappingRows(rows, {
      query: 'Next station',
      selectedCategories: ['utterance'],
      selectedSheets: ['GROUP INTENTIONS', 'SLOT REFERENCE', '매핑 테이블']
    });
    assert.deepEqual(utteranceMatches.map((row) => row.id), ['GROUP INTENTIONS:2']);
    assert.deepEqual(utteranceMatches[0].matchedFields, ['발화 패턴']);

    const slotMatches = core.filterMappingRows(rows, {
      query: 'home',
      selectedCategories: ['slot'],
      selectedSheets: ['GROUP INTENTIONS', 'SLOT REFERENCE', '매핑 테이블']
    });
    assert.deepEqual(slotMatches.map((row) => row.id), ['GROUP INTENTIONS:2', 'SLOT REFERENCE:5']);
    assert.deepEqual(slotMatches.map((row) => row.matchedCategories), [['slot'], ['slot']]);

    const mappingMatches = core.filterMappingRows(rows, {
      query: 'MusicStream',
      selectedCategories: ['mappingIntent'],
      selectedSheets: ['매핑 테이블']
    });
    assert.deepEqual(mappingMatches.map((row) => row.id), ['매핑 테이블:8']);
    assert.deepEqual(mappingMatches[0].matchedFields, ['매핑 인텐션']);
  });

  it('supports comma AND, pipe OR, wildcard, and sheet checkbox filtering', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    assert.deepEqual(
      core.filterMappingRows(rows, {
        query: 'media, Server*',
        selectedCategories: ['domainIntent', 'mappingIntent'],
        selectedSheets: ['GROUP INTENTIONS']
      }).map((row) => row.id),
      ['GROUP INTENTIONS:2']
    );

    assert.deepEqual(
      core.filterMappingRows(rows, {
        query: 'Server*|Music*',
        selectedCategories: ['mappingIntent'],
        selectedSheets: ['GROUP INTENTIONS', '매핑 테이블']
      }).map((row) => row.id),
      ['GROUP INTENTIONS:2', '매핑 테이블:8']
    );

    assert.deepEqual(
      core.filterMappingRows(rows, {
        query: 'MusicStream',
        selectedCategories: ['mappingIntent'],
        selectedSheets: ['GROUP INTENTIONS']
      }),
      []
    );
  });

  it('searches GROUP INTENTIONS by representative command and utterance pattern', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    const matches = core.filterGroupIntentionRows(rows, 'Next station');

    assert.deepEqual(matches.map((row) => row.id), ['GROUP INTENTIONS:2']);
    assert.deepEqual(matches[0].matchedFields, ['발화 패턴']);
    assert.equal(matches[0].mappingIntent, 'ServerPlayRadio');
  });

  it('keeps GROUP INTENTIONS workflow search out of SLOT REFERENCE rows', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    assert.deepEqual(core.filterGroupIntentionRows(rows, 'home'), []);
  });

  it('derives unique selectable slot candidates from selected GROUP INTENTIONS rows', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);
    const [groupRow] = core.filterGroupIntentionRows(rows, 'Next');

    assert.deepEqual(core.getGroupIntentionSlotCandidates(groupRow), ['Home', 'Passenger']);
  });

  it('filters SLOT REFERENCE rows from selected slot candidates', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    const slotRows = core.filterSlotReferenceRows(rows, ['Home', 'Passenger']);

    assert.deepEqual(slotRows.map((row) => row.id), ['SLOT REFERENCE:5', 'SLOT REFERENCE:6']);
    assert.deepEqual(
      slotRows.map((row) => [
        row.primaryText,
        row.values['Slot name'],
        row.values['Slot Value'],
        row.values['Slot Canonical']
      ]),
      [
        ['Home', 'environment', 'البيت', 'home'],
        ['Passenger', 'position', 'passenger', 'passenger']
      ]
    );
  });

  it('defaults to the first GROUP INTENTIONS row so SLOT REFERENCE can show immediately', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);
    const groupRows = core.filterGroupIntentionRows(rows, 'Next station');

    const selection = core.resolveMappingGroupSelection(groupRows, '', []);

    assert.equal(selection.selectedGroup.id, 'GROUP INTENTIONS:2');
    assert.equal(selection.selectedGroupId, 'GROUP INTENTIONS:2');
    assert.deepEqual(selection.selectedSlots, ['Home', 'Passenger']);
  });

  it('supports comma AND, pipe OR, and wildcard in GROUP INTENTIONS workflow search', () => {
    const rows = core.normalizeMappingWorkbook(sampleWorkbook);

    assert.deepEqual(
      core.filterGroupIntentionRows(rows, 'Next, station').map((row) => row.id),
      ['GROUP INTENTIONS:2']
    );
    assert.deepEqual(
      core.filterGroupIntentionRows(rows, 'Previous|Next*').map((row) => row.id),
      ['GROUP INTENTIONS:2']
    );
  });
});
