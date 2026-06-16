const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const TRAILING_DOTS_SPACES = /[. ]+$/g;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DEFAULT_FILENAME_PREFIX = 'default_json';

export function extractJsonCandidates(input) {
  const source = String(input ?? '');
  const candidates = [];

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        candidates.push({
          end: index + 1,
          start,
          text: source.slice(start, index + 1)
        });
        start = -1;
      }
    }
  }

  if (start !== -1) {
    candidates.push({
      end: source.length,
      incomplete: true,
      start,
      text: source.slice(start)
    });
  }

  return candidates;
}

export function parseJsonCandidates(input, { keepInvalidAsRaw = false } = {}) {
  const candidates = extractJsonCandidates(input);
  const valid = [];
  const errors = [];

  for (const candidate of candidates) {
    if (candidate.incomplete) {
      errors.push({
        candidate,
        message: 'JSON object is incomplete.'
      });
      continue;
    }

    try {
      valid.push({
        candidate,
        value: JSON.parse(candidate.text)
      });
    } catch (error) {
      if (keepInvalidAsRaw) {
        valid.push({
          candidate,
          value: candidate.text,
          valueKind: 'raw-string',
          warning: 'Invalid JSON was saved as a raw string.'
        });
        continue;
      }

      errors.push({
        candidate,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { errors, valid };
}

export function parseUploadedJsonContent(sourceFilename, text) {
  const sourceText = String(text ?? '');

  try {
    return {
      ok: true,
      sourceFilename,
      value: JSON.parse(sourceText),
      valueKind: 'json'
    };
  } catch (error) {
    return {
      message: `${sourceFilename}: ${error instanceof Error ? error.message : String(error)}`,
      ok: true,
      sourceFilename,
      value: sourceText,
      valueKind: 'raw-string',
      warning: 'Invalid JSON was saved as a raw string.'
    };
  }
}

export function findRecognitionText(value) {
  if (typeof value === 'string') {
    return findRecognitionTextInText(value);
  }

  const seen = new Set();

  function visit(current) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    if (seen.has(current)) {
      return undefined;
    }
    seen.add(current);

    if (
      Object.prototype.hasOwnProperty.call(current, 'recognitionText') &&
      typeof current.recognitionText === 'string' &&
      current.recognitionText.trim()
    ) {
      return current.recognitionText;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        const found = visit(item);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    }

    for (const key of Object.keys(current)) {
      const found = visit(current[key]);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  return visit(value);
}

export function findRecognitionTextInText(text) {
  const source = String(text ?? '');
  const match = source.match(/"recognitionText"\s*:\s*"((?:\\.|[^"\\])*)"/);

  if (!match) {
    return undefined;
  }

  const rawValue = match[1];
  try {
    return JSON.parse(`"${rawValue}"`);
  } catch {
    return rawValue;
  }
}

export function needsEnglishTranslation(text) {
  const value = String(text ?? '').trim();
  return value.length > 0 && /[^\x00-\x7f]/.test(value);
}

export function defaultFilenameBase(id) {
  const suffix = Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : 1;
  return `${DEFAULT_FILENAME_PREFIX}_${suffix}`;
}

export function sanitizeFilenameBase(text, fallback = defaultFilenameBase(1)) {
  const fallbackValue = String(fallback || defaultFilenameBase(1)).trim() || defaultFilenameBase(1);
  let base = String(text ?? '')
    .normalize('NFKC')
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
    .replace(/_+/g, '_')
    .replace(TRAILING_DOTS_SPACES, '');

  if (!base || base === '.' || base === '..' || RESERVED_WINDOWS_NAMES.test(base)) {
    base = fallbackValue;
  }

  return base.slice(0, 120);
}

export function ensureJsonExtension(filename) {
  const value = String(filename ?? '').trim();
  const safe = sanitizeFilenameBase(value.replace(/\.json$/i, ''), defaultFilenameBase(1));
  return `${safe}.json`;
}

export function ensureItemJsonFilename(item, index = 0) {
  const fallback = defaultFilenameBase(item?.id ?? index + 1);
  const value = String(item?.filename ?? '').trim();
  const safe = sanitizeFilenameBase(value.replace(/\.json$/i, ''), fallback);
  return `${safe}.json`;
}

export function dedupeFilenames(items) {
  const seen = new Set();

  return items.map((item, index) => {
    const filename = ensureItemJsonFilename(item, index);
    const base = filename.replace(/\.json$/i, '');
    let candidate = filename;
    let suffix = 2;

    while (seen.has(candidate.toLowerCase())) {
      candidate = `${base}_${suffix}.json`;
      suffix += 1;
    }

    seen.add(candidate.toLowerCase());
    return { ...item, filename: candidate };
  });
}

export function applyDedupedFilenames(items) {
  const deduped = dedupeFilenames(items);
  deduped.forEach((item, index) => {
    items[index].filename = item.filename;
  });
  return items;
}

export function createDownloadItem({
  id,
  parseWarning = '',
  sourceFilename = '',
  sourceType = 'paste',
  value,
  valueKind = 'json'
}) {
  const recognitionText = findRecognitionText(value) ?? '';
  const filenameSource = recognitionText || (sourceType === 'upload' && sourceFilename
    ? sourceFilename.replace(/\.json$/i, '')
    : recognitionText);
  const filenameBase = sanitizeFilenameBase(filenameSource, defaultFilenameBase(id));

  return {
    filename: ensureJsonExtension(filenameBase),
    id,
    manuallyEdited: false,
    recognitionText,
    sourceFilename,
    sourceType,
    valueKind,
    translationStatus: recognitionText ? 'ready' : 'missing',
    value,
    warning: parseWarning || (recognitionText ? '' : 'recognitionText 없음')
  };
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

export function formatDownloadContent(item) {
  if (item?.valueKind === 'raw-string') {
    return String(item.value ?? '');
  }

  return formatJson(item?.value);
}

export function buildZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const filenameBytes = encoder.encode(ensureJsonExtension(file.name));
    const contentBytes = encoder.encode(String(file.content ?? ''));
    const crc = crc32(contentBytes);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, filenameBytes.length, true);
    localView.setUint16(28, 0, true);

    localParts.push(localHeader, filenameBytes, contentBytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, filenameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(centralHeader, filenameBytes);

    offset += localHeader.length + filenameBytes.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader], {
    type: 'application/zip'
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
