import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJsonRecordFromUpload,
  normalizeJsonImportPayload
} from '../api/json-records-core.js';

describe('JSON DB record normalization', () => {
  it('builds searchable DB fields while preserving the original JSON payload', () => {
    const record = buildJsonRecordFromUpload({
      filename: 'weather.json',
      text: JSON.stringify({
        language: 'en_AU',
        serverResult: {
          result: {
            contentType: 'Weather',
            table_version: '3.3.21',
            vrResult: {
              recognitionText: 'What is the weather'
            }
          }
        },
        slots: [
          { name: 'location', value: 'Sydney' }
        ]
      })
    });

    assert.equal(record.sourceFilename, 'weather.json');
    assert.equal(record.recognitionText, 'What is the weather');
    assert.equal(record.language, 'en_AU');
    assert.equal(record.contentType, 'Weather');
    assert.equal(record.tableVersion, '3.3.21');
    assert.equal(record.slotSummary, 'location=Sydney');
    assert.equal(record.valueKind, 'json');
    assert.equal(record.rawText, '');
    assert.equal(record.rawJson.serverResult.result.contentType, 'Weather');
    assert.match(record.contentHash, /^[a-f0-9]{64}$/);
  });

  it('stores malformed JSON as raw text with extracted recognitionText when possible', () => {
    const record = buildJsonRecordFromUpload({
      filename: 'raw.json',
      text: '{"recognitionText":"Raw Weather","prompt":"\u001b\\tn=WEATHER\\broken"}'
    });

    assert.equal(record.sourceFilename, 'raw.json');
    assert.equal(record.recognitionText, 'Raw Weather');
    assert.equal(record.valueKind, 'raw-string');
    assert.equal(record.rawJson, null);
    assert.match(record.rawText, /Raw Weather/);
  });

  it('normalizes import payloads with batch metadata and multiple files', () => {
    const payload = normalizeJsonImportPayload({
      batchName: 'June logs',
      description: 'smoke test',
      files: [
        { filename: 'a.json', text: '{"recognitionText":"A"}' },
        { filename: 'b.json', text: '{"recognitionText":"B"}' }
      ]
    });

    assert.equal(payload.batch.name, 'June logs');
    assert.equal(payload.batch.description, 'smoke test');
    assert.equal(payload.records.length, 2);
    assert.deepEqual(
      payload.records.map((record) => record.recognitionText),
      ['A', 'B']
    );
  });

  it('applies the admin-selected language to every imported record', () => {
    const payload = normalizeJsonImportPayload({
      batchName: 'Australia logs',
      language: 'en_AU',
      files: [
        { filename: 'a.json', text: '{"recognitionText":"A"}' },
        { filename: 'b.json', text: '{"language":"ko_KR","recognitionText":"B"}' }
      ]
    });

    assert.deepEqual(
      payload.records.map((record) => record.language),
      ['en_AU', 'en_AU']
    );
  });

  it('keeps otherwise identical JSON distinct across selected languages', () => {
    const australia = normalizeJsonImportPayload({
      language: 'en_AU',
      files: [{ filename: 'same.json', text: '{"recognitionText":"Radio"}' }]
    });
    const unitedStates = normalizeJsonImportPayload({
      language: 'en_US',
      files: [{ filename: 'same.json', text: '{"recognitionText":"Radio"}' }]
    });

    assert.notEqual(australia.records[0].contentHash, unitedStates.records[0].contentHash);
  });
});
