import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, nonCanonicalDates } from '../lib/calendar-date.mjs';
import { styleViolations, assertBuiltOwnership } from '../scripts/check-site-design.mjs';
import { withReviewDesign } from '../scripts/sync-review-design.mjs';

test('calendar presentation keeps year/month precision, leap days and source identities', () => {
  for (const [input, expected] of [['2026/1/2','2026-01-02'],['2026年1月2日','2026-01-02'],['2026-1','2026-01'],['2026','2026'],['2024-2-29','2024-02-29'],['2026-02-29','2026-02-29'],['2026-11-20T00:00:00Z','2026-11-20T00:00:00Z'],['source-2026-1-2.json','source-2026-1-2.json']]) assert.equal(calendarDate(input), expected);
  assert.deepEqual(nonCanonicalDates('2026-11-20 · 2026-11 · 2026'), []);
  assert.equal(nonCanonicalDates('June 7, 2026 and 2026/1/2 and 2026-1-2').length, 3);
});
test('guards reject an isolated page and unowned typography/ordinary spacing', () => {
  assert.throws(() => assertBuiltOwnership('island.html', '<body>hello</body>', 'body{font-size:16px}'), /shared design/);
  assert.equal(styleViolations('.body{font-size:17px;line-height:1.8;padding:calc(18px);margin:-1px 19px}').length, 4);
  assert.deepEqual(styleViolations('.body{font-size:var(--type-body);line-height:var(--leading-body);padding:var(--space-4)}'), []);
});
test('offline synchronization is idempotent and leaves source JSON/script untouched', () => {
  const html='<head><style>body{margin:0}</style></head><script type="application/json">{"source":"2026/1/2"}</script><script>const x = 1;</script>';
  const result=withReviewDesign(html, ':root{--community-design-version:1}');
  assert.equal(withReviewDesign(result, ':root{--community-design-version:1}'),result);
  assert.ok(result.endsWith(html.slice(html.indexOf('</head>'))));
});
