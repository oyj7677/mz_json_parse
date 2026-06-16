import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDedupedFilenames,
  buildZipBlob,
  createDownloadItem,
  dedupeFilenames,
  ensureJsonExtension,
  extractJsonCandidates,
  findRecognitionText,
  formatDownloadContent,
  formatJson,
  needsEnglishTranslation,
  parseUploadedJsonContent,
  parseJsonCandidates,
  sanitizeFilenameBase
} from '../public/core.js';

describe('JSON extraction', () => {
  it('extracts a pure JSON object', () => {
    const candidates = extractJsonCandidates('{"recognitionText":"Sample Text","score":0.98}');

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].text, '{"recognitionText":"Sample Text","score":0.98}');
  });

  it('extracts multiple JSON objects from log text', () => {
    const input = [
      '2026-05-07 INFO result={"recognitionText":"First","score":1}',
      'debug payload={"recognitionText":"Second","items":[1,2,{"ok":true}]} end'
    ].join('\n');

    const result = parseJsonCandidates(input);

    assert.equal(result.valid.length, 2);
    assert.equal(result.valid[0].value.recognitionText, 'First');
    assert.equal(result.valid[1].value.items[2].ok, true);
    assert.equal(result.errors.length, 0);
  });

  it('keeps braces inside strings from breaking extraction', () => {
    const result = parseJsonCandidates('INFO {"recognitionText":"A {literal} brace","nested":{"ok":true}} tail');

    assert.equal(result.valid.length, 1);
    assert.equal(result.valid[0].value.recognitionText, 'A {literal} brace');
    assert.equal(result.valid[0].value.nested.ok, true);
  });

  it('reports malformed and incomplete JSON candidates', () => {
    const result = parseJsonCandidates('bad {"recognitionText":} next {"recognitionText":"Good"} tail {"missing": true');

    assert.equal(result.valid.length, 1);
    assert.equal(result.valid[0].value.recognitionText, 'Good');
    assert.equal(result.errors.length, 2);
  });

  it('can keep malformed pasted JSON candidates as raw strings', () => {
    const rawText = '{"recognitionText":"What is the weather","prompt":"\u001b\\tn=WEATHER\\Currently sunny"}';
    const result = parseJsonCandidates(rawText, { keepInvalidAsRaw: true });

    assert.equal(result.valid.length, 1);
    assert.equal(result.errors.length, 0);
    assert.equal(result.valid[0].value, rawText);
    assert.equal(result.valid[0].valueKind, 'raw-string');

    const item = createDownloadItem({
      id: 11,
      value: result.valid[0].value,
      valueKind: result.valid[0].valueKind
    });

    assert.equal(item.recognitionText, 'What is the weather');
    assert.equal(item.filename, 'What_is_the_weather.json');
    assert.equal(formatDownloadContent(item), rawText);
  });
});

describe('recognitionText and filename handling', () => {
  it('finds recognitionText recursively', () => {
    const text = findRecognitionText({ wrapper: { result: [{ recognitionText: 'Nested Text' }] } });

    assert.equal(text, 'Nested Text');
  });

  it('detects non-English filename text', () => {
    assert.equal(needsEnglishTranslation('안녕하세요 세계'), true);
    assert.equal(needsEnglishTranslation('Sample Text'), false);
  });

  it('sanitizes filename bases and replaces whitespace with underscores', () => {
    assert.equal(sanitizeFilenameBase('Sample Text / Bad:Name', 'Untitled_1'), 'Sample_Text_Bad_Name');
    assert.equal(ensureJsonExtension('Sample_Text'), 'Sample_Text.json');
    assert.equal(ensureJsonExtension('Sample_Text.json'), 'Sample_Text.json');
  });

  it('uses translated English phrases for filename bases without changing JSON content', () => {
    const value = { recognitionText: '안녕하세요 세계', score: 0.98 };
    const filenameBase = sanitizeFilenameBase('Hello World', 'Untitled_1');

    assert.equal(filenameBase, 'Hello_World');
    assert.equal(value.recognitionText, '안녕하세요 세계');
  });

  it('deduplicates filenames with numeric suffixes', () => {
    const items = dedupeFilenames([
      { filename: 'Sample_Text.json' },
      { filename: 'Sample_Text.json' },
      { filename: 'Sample_Text_2.json' },
      { filename: 'Report' }
    ]);

    assert.deepEqual(items.map((item) => item.filename), [
      'Sample_Text.json',
      'Sample_Text_2.json',
      'Sample_Text_2_2.json',
      'Report.json'
    ]);
  });

  it('can deduplicate filenames without replacing item objects', () => {
    const first = { filename: 'Same.json', marker: 1 };
    const second = { filename: 'Same.json', marker: 2 };
    const items = [first, second];

    applyDedupedFilenames(items);

    assert.equal(items[0], first);
    assert.equal(items[1], second);
    assert.deepEqual(items.map((item) => item.filename), ['Same.json', 'Same_2.json']);
  });

  it('creates pasted items from recognitionText', () => {
    const item = createDownloadItem({
      id: 7,
      value: { recognitionText: 'Sample Text' }
    });

    assert.equal(item.filename, 'Sample_Text.json');
    assert.equal(item.recognitionText, 'Sample Text');
    assert.equal(item.sourceType, 'paste');
  });

  it('creates uploaded items from recognitionText when available', () => {
    const item = createDownloadItem({
      id: 8,
      sourceFilename: '원본 파일 이름.json',
      sourceType: 'upload',
      value: { recognitionText: 'Should Rename Upload File' }
    });

    assert.equal(item.recognitionText, 'Should Rename Upload File');
    assert.equal(item.filename, 'Should_Rename_Upload_File.json');
    assert.equal(item.sourceType, 'upload');
  });

  it('uses the original upload filename when recognitionText is missing', () => {
    const item = createDownloadItem({
      id: 9,
      sourceFilename: 'original file.json',
      sourceType: 'upload',
      value: { score: 0.98 }
    });

    assert.equal(item.filename, 'original_file.json');
    assert.equal(item.recognitionText, '');
  });

  it('creates default filenames when recognitionText cannot produce a filename', () => {
    const missing = createDownloadItem({
      id: 1,
      value: { score: 0.98 }
    });
    const unsafe = createDownloadItem({
      id: 2,
      value: { recognitionText: '///' }
    });

    assert.equal(missing.filename, 'default_json_1.json');
    assert.equal(unsafe.filename, 'default_json_2.json');
  });

  it('keeps generated default filenames unique', () => {
    const items = dedupeFilenames([
      { id: 1, filename: '' },
      { id: 2, filename: '' },
      { id: 3, filename: '///' },
      { id: 4, filename: 'default_json_1.json' }
    ]);

    assert.deepEqual(items.map((item) => item.filename), [
      'default_json_1.json',
      'default_json_2.json',
      'default_json_3.json',
      'default_json_1_2.json'
    ]);
  });
});

describe('formatting and ZIP output', () => {
  it('formats JSON with newlines and two-space indentation', () => {
    const formatted = formatJson({ recognitionText: 'Sample Text', score: 0.98 });

    assert.equal(formatted, '{\n  "recognitionText": "Sample Text",\n  "score": 0.98\n}');
  });

  it('builds a ZIP blob with expected file names and content bytes', async () => {
    const blob = buildZipBlob([
      {
        name: 'Sample_Text.json',
        content: formatJson({ recognitionText: 'Sample Text' })
      },
      {
        name: 'Hello_World.json',
        content: formatJson({ recognitionText: '안녕하세요 세계' })
      }
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.match(text, /Sample_Text\.json/);
    assert.match(text, /Hello_World\.json/);
    assert.match(text, /"recognitionText": "Sample Text"/);
  });
});

describe('uploaded JSON files', () => {
  it('parses uploaded JSON file content', () => {
    const result = parseUploadedJsonContent('sample.json', '{"recognitionText":"From File"}');

    assert.equal(result.ok, true);
    assert.equal(result.sourceFilename, 'sample.json');
    assert.equal(result.value.recognitionText, 'From File');
  });

  it('keeps invalid uploaded JSON as a raw string', () => {
    const rawText = '"tts" : "On \u001b\\tn=date\\05/10\u001b\\tn=normal\\, there will be thunder storms."';
    const result = parseUploadedJsonContent('broken.json', rawText);

    assert.equal(result.ok, true);
    assert.equal(result.value, rawText);
    assert.equal(result.valueKind, 'raw-string');
    assert.match(result.warning, /raw string/i);
  });

  it('creates raw uploaded item filenames from recognitionText inside JSON-like text', () => {
    const rawText = '{\n  "recognitionText" : "What is the weather",\n  "tts" : "On \u001b\\tn=date\\05/10\u001b\\tn=normal\\, there will be thunder storms."\n}';
    const item = createDownloadItem({
      id: 10,
      sourceFilename: 'broken.json',
      sourceType: 'upload',
      value: rawText,
      valueKind: 'raw-string'
    });

    assert.equal(item.recognitionText, 'What is the weather');
    assert.equal(item.filename, 'What_is_the_weather.json');
  });

  it('formats raw uploaded strings as original JSON-like content', () => {
    const rawText = '{\n  "tts" : "On \u001b\\tn=date\\05/10\u001b\\tn=normal\\, there will be thunder storms."\n}';
    const formatted = formatDownloadContent({
      value: rawText,
      valueKind: 'raw-string'
    });

    assert.equal(formatted, rawText);
    assert.match(formatted, /^\{/);
    assert.doesNotMatch(formatted, /^"/);
    assert.doesNotMatch(formatted, /\\n/);
  });

  it('formats parsed JSON downloads with pretty indentation', () => {
    const formatted = formatDownloadContent({
      value: { recognitionText: 'Sample Text', score: 0.98 },
      valueKind: 'json'
    });

    assert.equal(formatted, '{\n  "recognitionText": "Sample Text",\n  "score": 0.98\n}');
  });
});
