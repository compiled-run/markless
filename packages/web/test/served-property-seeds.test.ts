import { expect, test } from 'vitest';
import { servedPropertySeeds } from '../src/served-property-seeds.ts';

test('served property-only attributes leave the html and come back as values addressed by element position', () => {
	const served = servedPropertySeeds(
		'<!--markless:page-start--><main><p>The volume is up</p><input type="checkbox" indeterminate=""><ul><li><audio volume="0.5"></audio></li><li><div scrollTop="30" class="pane"></div></li></ul></main>',
	);
	expect(served?.html).toBe(
		'<!--markless:page-start--><main><p>The volume is up</p><input type="checkbox"><ul><li><audio></audio></li><li><div class="pane"></div></li></ul></main>',
	);
	expect(served?.seeds).toEqual([
		[[0, 1], 'indeterminate', true],
		[[0, 2, 0, 0], 'volume', 0.5],
		[[0, 2, 1, 0], 'scrollTop', 30],
	]);
});

test('a page with no property-only attribute is left exactly as it was', () => {
	for (const html of [
		'<main><p>volume indeterminate scrollTop</p><input value="indeterminate"></main>',
		'<main><input type="checkbox" checked=""></main>',
		'<template><input indeterminate=""></template>',
	])
		expect(servedPropertySeeds(html)).toBeUndefined();
});
