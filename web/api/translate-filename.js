const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
};

export function buildGoogleTranslateUrl(text, { targetLanguage = 'en' } = {}) {
  const url = new URL(GOOGLE_TRANSLATE_URL);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLanguage);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', String(text ?? ''));
  return url;
}

export function extractGoogleTranslateText(responseJson) {
  if (!Array.isArray(responseJson?.[0])) {
    return '';
  }

  return responseJson[0]
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
    .join('')
    .trim();
}

export async function translateFilenameText(
  text,
  {
    fetchImpl = fetch,
    targetLanguage = 'en'
  } = {}
) {
  const sourceText = String(text ?? '').trim();

  if (!sourceText) {
    return {
      error: 'No text was provided for translation.',
      ok: false,
      status: 400
    };
  }

  try {
    const url = buildGoogleTranslateUrl(sourceText, { targetLanguage });
    const response = await fetchImpl(url.href, { method: 'GET' });
    const responseJson = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        error: `Google Translate request failed with status ${response.status}.`,
        ok: false,
        status: response.status
      };
    }

    const translatedText = extractGoogleTranslateText(responseJson);
    if (!translatedText) {
      return {
        error: 'Translation response did not include text.',
        ok: false,
        status: 502
      };
    }

    return {
      ok: true,
      status: 200,
      translatedText
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      status: 502
    };
  }
}

export async function POST(request) {
  const body = await readRequestJson(request);
  const result = await translateFilenameText(body.text);

  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }

  return jsonResponse({ translatedText: result.translatedText }, 200);
}

export function GET() {
  return methodNotAllowedResponse();
}

export default {
  async fetch(request) {
    if (request.method === 'POST') {
      return POST(request);
    }

    return methodNotAllowedResponse();
  }
};

async function readRequestJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status
  });
}
