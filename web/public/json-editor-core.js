export function parseJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(String(text ?? '')), error: '' };
  } catch (error) {
    return {
      ok: false,
      value: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function formatJsonText(textOrValue) {
  const value = typeof textOrValue === 'string' ? JSON.parse(textOrValue) : textOrValue;
  return JSON.stringify(value, null, 2);
}

export function compactJsonText(textOrValue) {
  const value = typeof textOrValue === 'string' ? JSON.parse(textOrValue) : textOrValue;
  return JSON.stringify(value);
}

export function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((sorted, key) => {
      sorted[key] = sortJsonValue(value[key]);
      return sorted;
    }, {});
}

export function diffJsonValues(left, right) {
  const changes = [];
  collectDiffs(left, right, [], changes);
  return changes;
}

export function resolveJsonEditorDownloadName(name) {
  const trimmed = String(name ?? '').trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  if (!safe) {
    return 'json_editor_document.json';
  }
  return safe.toLowerCase().endsWith('.json') ? safe : `${safe}.json`;
}

function collectDiffs(left, right, path, changes) {
  if (Object.is(left, right)) {
    return;
  }

  const leftObject = isContainer(left);
  const rightObject = isContainer(right);

  if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) {
    changes.push({ path: jsonPointer(path), type: 'changed', left, right });
    return;
  }

  const keys = Array.isArray(left) || Array.isArray(right)
    ? arrayIndexes(left, right)
    : objectKeys(left, right);

  for (const key of keys) {
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);
    if (!hasLeft) {
      changes.push({ path: jsonPointer([...path, key]), type: 'added', left: undefined, right: right[key] });
      continue;
    }
    if (!hasRight) {
      changes.push({ path: jsonPointer([...path, key]), type: 'removed', left: left[key], right: undefined });
      continue;
    }
    collectDiffs(left[key], right[key], [...path, key], changes);
  }
}

function isContainer(value) {
  return Boolean(value) && typeof value === 'object';
}

function objectKeys(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort((a, b) => a.localeCompare(b));
}

function arrayIndexes(left, right) {
  return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => String(index));
}

function jsonPointer(path) {
  if (path.length === 0) {
    return '/';
  }
  return `/${path.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}
