import { expect, test } from 'vitest';
import { unmatchedResumeCacheExcludes } from '../src/resume-cache-excludes.ts';

const names = new Set(['quote', 'tickerPrice', 'tickerVolume', 'orders']);

test('exclude entries that name an async computed, exactly or by a trailing *, pass', () => {
	expect(unmatchedResumeCacheExcludes({ exclude: ['quote', 'ticker*'] }, names)).toBeUndefined();
	expect(unmatchedResumeCacheExcludes({}, names)).toBeUndefined();
	expect(unmatchedResumeCacheExcludes(false, names)).toBeUndefined();
	expect(unmatchedResumeCacheExcludes(true, names)).toBeUndefined();
});

test('an entry naming nothing fails with the entry and the nearest names', () => {
	const message = unmatchedResumeCacheExcludes({ exclude: ['quotes', 'ticker*'] }, names);
	expect(message).toMatch(/^MARKLESS_RESUME_CACHE_EXCLUDE_UNMATCHED: resumeCache.exclude entry "quotes"/);
	expect(message).toContain('Nearest names: quote,');
	expect(message).not.toContain('"ticker*"');
});

test('a glob that matches nothing fails too, and each unmatched entry gets its own line', () => {
	const message = unmatchedResumeCacheExcludes({ exclude: ['stock*', 'order'] }, names)!;
	expect(message.split('\n')).toHaveLength(2);
	expect(message).toContain('"stock*"');
	expect(message).toContain('"order"');
	expect(message.split('\n')[1]).toContain('Nearest names: orders');
});

test('a build with no async computed names no near misses', () => {
	expect(unmatchedResumeCacheExcludes({ exclude: ['quote'] }, new Set())).toBe(
		'MARKLESS_RESUME_CACHE_EXCLUDE_UNMATCHED: resumeCache.exclude entry "quote" matches no async computed in this build. Name an async computed (computed(async () => ...)) declared in a page or component, or remove the entry.',
	);
});
