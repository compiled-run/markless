import { expect, test } from 'vitest';
import { buildWarnings } from './build-warnings.mjs';

const stderr = [
	'[PLUGIN_TIMINGS] JavaScript callbacks ran for 2.9s of this 3.3s build (88%).',
	'  - plugin vite:asset load (953 calls)',
	'See https://rolldown.rs/reference/InputOptions.checks#bundlertimings for more details.',
	'',
	'[plugin builtin:vite-reporter] ',
	'(!) Some chunks are larger than 500 kB after minification. Consider:',
	'- Using dynamic import() to code-split the application',
	'- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.',
	'\u001b[33m[INEFFECTIVE_DYNAMIC_IMPORT] \u001b[0ma.js is dynamically imported by b.js',
].join('\n');

test('every warning is reported once, with the timing report and reporter advice left out', () => {
	expect(buildWarnings(stderr)).toEqual([
		'[plugin builtin:vite-reporter] (!) Some chunks are larger than 500 kB after minification. Consider:',
		'[INEFFECTIVE_DYNAMIC_IMPORT] a.js is dynamically imported by b.js',
	]);
});

test('the docs site is held to every warning, the chunk-size warning included', () => {
	expect(buildWarnings(stderr, 'website')).toEqual(buildWarnings(stderr));
});
