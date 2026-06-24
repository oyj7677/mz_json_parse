import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactJsonText,
  diffJsonValues,
  formatJsonText,
  parseJsonText,
  resolveJsonEditorDownloadName,
  sortJsonValue
} from '../public/json-editor-core.js';

describe('json editor core helpers', () => {
  it('parses valid JSON and reports invalid JSON', () => {
    assert.deepEqual(parseJsonText('{"a":1}'), { ok: true, value: { a: 1 }, error: '' });

    const invalid = parseJsonText('{"a":');
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /Unexpected|position|JSON/);
  });

  it('formats and compacts JSON text', () => {
    assert.equal(formatJsonText('{"a":1,"b":[2]}'), '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
    assert.equal(compactJsonText('{\n  "a": 1\n}'), '{"a":1}');
  });

  it('sorts object keys recursively without reordering arrays', () => {
    assert.deepEqual(sortJsonValue({ b: 1, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] }), {
      a: { c: 3, d: 4 },
      b: 1,
      list: [{ y: 2, z: 1 }]
    });
  });

  it('diffs added, removed, and changed JSON paths', () => {
    assert.deepEqual(diffJsonValues({ a: 1, b: 2, same: true }, { a: 9, c: 3, same: true }), [
      { path: '/a', type: 'changed', left: 1, right: 9 },
      { path: '/b', type: 'removed', left: 2, right: undefined },
      { path: '/c', type: 'added', left: undefined, right: 3 }
    ]);
  });

  it('resolves safe download filenames', () => {
    assert.equal(resolveJsonEditorDownloadName('sample.json'), 'sample.json');
    assert.equal(resolveJsonEditorDownloadName('sample'), 'sample.json');
    assert.equal(resolveJsonEditorDownloadName('bad:name'), 'bad_name.json');
    assert.equal(resolveJsonEditorDownloadName(''), 'json_editor_document.json');
  });
});
