import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTE_TOOLS,
  normalizeToolRoute,
  pathForTool
} from '../public/routes.js';

describe('SPA tool routes', () => {
  it('maps each public path to a stable tool id', () => {
    assert.equal(normalizeToolRoute('/').tool, 'hub');
    assert.equal(normalizeToolRoute('/formatter').tool, 'formatter');
    assert.equal(normalizeToolRoute('/explorer').tool, 'explorer');
    assert.equal(normalizeToolRoute('/mapping-table').tool, 'mapping');
    assert.equal(normalizeToolRoute('/string-resource').tool, 'stringResource');
    assert.equal(normalizeToolRoute('/admin').tool, 'admin');
    assert.equal(normalizeToolRoute('/json-editor').tool, 'jsonEditor');
  });

  it('normalizes trailing slashes and unknown paths', () => {
    assert.deepEqual(normalizeToolRoute('/explorer/'), ROUTE_TOOLS.explorer);
    assert.deepEqual(normalizeToolRoute('/unknown-tool'), ROUTE_TOOLS.hub);
  });

  it('returns canonical paths for tool navigation', () => {
    assert.equal(pathForTool('formatter'), '/formatter');
    assert.equal(pathForTool('mapping'), '/mapping-table');
    assert.equal(pathForTool('admin'), '/admin');
    assert.equal(pathForTool('jsonEditor'), '/json-editor');
    assert.equal(pathForTool('missing'), '/');
  });
});
