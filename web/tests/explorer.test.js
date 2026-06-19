import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExplorerSuggestions,
  createExplorerItem,
  filterExplorerItems,
  formatDownloadContent,
  parseExplorerSearchTerms
} from '../public/core.js';

describe('JSON Explorer helpers', () => {
  it('creates explorer items from uploaded JSON values using recognitionText as the title', () => {
    const item = createExplorerItem({
      id: 1,
      sourceFilename: 'weather.json',
      value: { serverResult: { vrResult: { recognitionText: 'What is the weather' } } },
      valueKind: 'json'
    });

    assert.equal(item.id, 1);
    assert.equal(item.sourceFilename, 'weather.json');
    assert.equal(item.recognitionText, 'What is the weather');
    assert.equal(item.title, 'What is the weather');
    assert.equal(item.valueKind, 'json');
    assert.match(formatDownloadContent(item), /"recognitionText": "What is the weather"/);
  });

  it('uses a readable fallback title when recognitionText is missing', () => {
    const item = createExplorerItem({
      id: 2,
      sourceFilename: 'missing.json',
      value: { score: 0.98 },
      valueKind: 'json'
    });

    assert.equal(item.recognitionText, '');
    assert.equal(item.title, 'recognitionText 없음');
    assert.equal(item.sourceFilename, 'missing.json');
  });

  it('creates explorer items with table fields for search results', () => {
    const item = createExplorerItem({
      id: 3,
      sourceFilename: 'weather.json',
      value: {
        language: 'en_AU',
        serverResult: {
          result: {
            contentType: 'Weather',
            table_version: '3.3.15'
          },
          vrResult: {
            recognitionText: 'What is the weather'
          }
        },
        slots: [
          { name: 'location', value: 'Sydney' },
          { name: 'date', literal: 'today' }
        ]
      },
      valueKind: 'json'
    });

    assert.equal(item.language, 'en_AU');
    assert.equal(item.slotSummary, 'location=Sydney, date=today');
    assert.equal(item.contentType, 'Weather');
    assert.equal(item.tableVersion, '3.3.15');
  });

  it('creates explorer table fields from ResultInfo files exported from serverResult.result', () => {
    const item = createExplorerItem({
      id: 9,
      sourceFilename: '06-15-07-18-25-final.json',
      value: {
        VSCResult: '00',
        CerenceID: '2328e939-8f59-419f-81ef-9a913d7cac1c',
        ResultInfo: {
          vrResult: {
            recognitionText: 'البحث عن نقطة اهتمام',
            nlu: {
              score: '0',
              domain: 'ude',
              slot: {
                cat: {
                  canonical: ['point_of_interest'],
                  literal: 'نقطة اهتمام'
                },
                'Search-phrase': {
                  literal: 'نقطة اهتمام'
                }
              },
              intent: 'GoogleSearch'
            }
          },
          table_version: '3.3.21',
          contentType: 'FindPOI'
        }
      },
      valueKind: 'json'
    });

    assert.equal(item.recognitionText, 'البحث عن نقطة اهتمام');
    assert.equal(item.slotSummary, 'cat=نقطة اهتمام, Search-phrase=نقطة اهتمام');
    assert.equal(item.contentType, 'FindPOI');
    assert.equal(item.tableVersion, '3.3.21');
  });

  it('extracts explorer table fields from raw JSON-like uploaded text', () => {
    const item = createExplorerItem({
      id: 10,
      sourceFilename: 'raw-weather-final.json',
      value: `{
        "ResultInfo": {
          "vrResult": {
            "recognitionText": "weather today",
            "nlu": {
              "slot": {
                "date": { "literal": "today" },
                "location": { "literal": "Dubai" }
              }
            }
          },
          "table_version": "3.3.21",
          "contentType": "Weather"
        }
      }`,
      valueKind: 'raw-string'
    });

    assert.equal(item.recognitionText, 'weather today');
    assert.equal(item.slotSummary, 'date=today, location=Dubai');
    assert.equal(item.contentType, 'Weather');
    assert.equal(item.tableVersion, '3.3.21');
  });

  it('filters explorer items by visible table fields using comma-separated AND terms', () => {
    const items = [
      createExplorerItem({
        id: 1,
        sourceFilename: 'weather.json',
        value: {
          language: 'en_AU',
          recognitionText: 'What is the weather',
          serverResult: { result: { contentType: 'Weather', table_version: '3.3.15' } },
          slots: [{ name: 'location', value: 'Sydney' }]
        },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 2,
        sourceFilename: 'navigate.json',
        value: {
          language: 'en_US',
          recognitionText: 'Navigate to home',
          serverResult: { result: { contentType: 'Navigation', table_version: '3.3.14' } },
          slots: [{ name: 'destination', value: 'home' }]
        },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 3,
        sourceFilename: 'settings.json',
        value: {
          language: 'ko_KR',
          recognitionText: 'Open settings',
          serverResult: { result: { contentType: 'Device', table_version: '3.3.15' } }
        },
        valueKind: 'json'
      })
    ];

    assert.deepEqual(filterExplorerItems(items, '').map((item) => item.id), []);
    assert.deepEqual(filterExplorerItems(items, 'weather').map((item) => item.id), [1]);
    assert.deepEqual(filterExplorerItems(items, 'en_US').map((item) => item.id), [2]);
    assert.deepEqual(filterExplorerItems(items, '3.3.15').map((item) => item.id), [1, 3]);
    assert.deepEqual(filterExplorerItems(items, 'weather,en_AU').map((item) => item.id), [1]);
    assert.deepEqual(filterExplorerItems(items, 'weather,en_US').map((item) => item.id), []);
    assert.deepEqual(filterExplorerItems(items, 'destination=home').map((item) => item.id), [2]);
  });

  it('filters explorer items with OR pipes and wildcard terms', () => {
    const items = [
      createExplorerItem({
        id: 1,
        sourceFilename: 'weather-dubai.json',
        value: {
          recognitionText: 'What is the weather',
          ResultInfo: { contentType: 'Weather', table_version: '3.3.21' },
          slot: { location: { literal: 'Dubai' } }
        },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 2,
        sourceFilename: 'fuel.json',
        value: {
          recognitionText: 'Find gas station',
          ResultInfo: { contentType: 'Fuel', table_version: '3.3.21' },
          slot: { cat: { literal: 'gas_station' } }
        },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 3,
        sourceFilename: 'waypoint.json',
        value: {
          recognitionText: 'Add waypoint',
          ResultInfo: { contentType: 'ServerWaypoint', table_version: '3.3.21' }
        },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 4,
        sourceFilename: 'route.json',
        value: {
          recognitionText: 'Show route',
          ResultInfo: { contentType: 'ShowRoute', table_version: '3.3.21' }
        },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 5,
        sourceFilename: 'volume.json',
        value: {
          recognitionText: 'Increase volume',
          ResultInfo: { contentType: 'ServerIncreaseVolume', table_version: '3.3.21' }
        },
        valueKind: 'json'
      })
    ];

    assert.deepEqual(filterExplorerItems(items, 'Weather|Fuel').map((item) => item.id), [1, 2]);
    assert.deepEqual(filterExplorerItems(items, 'Weather|Fuel, Dubai').map((item) => item.id), [1]);
    assert.deepEqual(filterExplorerItems(items, 'Server*, volume').map((item) => item.id), [5]);
    assert.deepEqual(filterExplorerItems(items, '*waypoint|*route').map((item) => item.id), [3, 4]);
    assert.deepEqual(filterExplorerItems(items, '*gas*').map((item) => item.id), [2]);
  });

  it('builds recognitionText suggestions and replaces only the active comma term', () => {
    const items = [
      createExplorerItem({
        id: 1,
        sourceFilename: 'weather.json',
        value: { recognitionText: 'What is the weather' },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 2,
        sourceFilename: 'navigate.json',
        value: { recognitionText: 'Navigate to home' },
        valueKind: 'json'
      })
    ];

    assert.deepEqual(parseExplorerSearchTerms('weather, en_AU'), ['weather', 'en_AU']);
    assert.deepEqual(buildExplorerSuggestions(items, 'weather, nav'), [
      {
        id: 2,
        recognitionText: 'Navigate to home',
        replacementQuery: 'weather, Navigate to home',
        sourceFilename: 'navigate.json'
      }
    ]);
  });

  it('summarizes slots without throwing when slot values contain cycles', () => {
    const cyclicSlot = { name: 'location' };
    cyclicSlot.value = cyclicSlot;

    const item = createExplorerItem({
      id: 4,
      sourceFilename: 'cyclic-slots.json',
      value: {
        recognitionText: 'Weather in Sydney',
        slots: [
          cyclicSlot,
          { name: 'date', literal: 'today' }
        ]
      },
      valueKind: 'json'
    });

    assert.equal(item.slotSummary, 'location, date=today');
  });

  it('dedupes recognitionText suggestions before applying the limit', () => {
    const items = [
      createExplorerItem({
        id: 1,
        sourceFilename: 'navigate-home.json',
        value: { recognitionText: 'Navigate to home' },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 2,
        sourceFilename: 'navigate-home-copy.json',
        value: { recognitionText: 'navigate to home' },
        valueKind: 'json'
      }),
      createExplorerItem({
        id: 3,
        sourceFilename: 'navigate-settings.json',
        value: { recognitionText: 'Navigate to settings' },
        valueKind: 'json'
      })
    ];

    assert.deepEqual(buildExplorerSuggestions(items, 'nav', 2), [
      {
        id: 1,
        recognitionText: 'Navigate to home',
        replacementQuery: 'Navigate to home',
        sourceFilename: 'navigate-home.json'
      },
      {
        id: 3,
        recognitionText: 'Navigate to settings',
        replacementQuery: 'Navigate to settings',
        sourceFilename: 'navigate-settings.json'
      }
    ]);
  });

  it('parses quoted search terms and quotes suggestion replacements containing commas', () => {
    const items = [
      createExplorerItem({
        id: 1,
        sourceFilename: 'hello.json',
        value: { recognitionText: 'Hello, world' },
        valueKind: 'json'
      })
    ];

    assert.deepEqual(parseExplorerSearchTerms('"Hello, world", en_US'), ['Hello, world', 'en_US']);
    assert.deepEqual(buildExplorerSuggestions(items, 'hello'), [
      {
        id: 1,
        recognitionText: 'Hello, world',
        replacementQuery: '"Hello, world"',
        sourceFilename: 'hello.json'
      }
    ]);
  });
});
