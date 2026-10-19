import { expect, test } from 'vitest';
import { minifySync } from 'rolldown/utils';
import { warmEvaluatedImports, warmPacksSuffix } from '../src/build/warm-packs.ts';

test('the warm-pack suffix reads back its packs as written and once minified', () => {
	const suffix = warmPacksSuffix(['./a.js', './b.js']);
	expect(warmEvaluatedImports(`export const x = 1;\n${suffix}`)).toEqual(['./a.js', './b.js']);
	const minified = minifySync('chunk.js', `export const x = 1;\n${suffix}`, {
		compress: true,
		mangle: true,
		module: true,
	}).code;
	expect(minified).not.toContain('pack');
	expect(warmEvaluatedImports(minified)).toEqual(['./a.js', './b.js']);
	expect(warmEvaluatedImports('setTimeout(()=>import("./c.js"));')).toEqual([]);
});
