import { expect, test } from 'vitest';
import { withoutRepeatedRules } from '../src/build/stylesheet-repeats.ts';

test('a rule repeated at the top level keeps only its last copy', () => {
	expect(withoutRepeatedRules('.a{color:red}.b{color:blue}.a{color:red}')).toBe(
		'.b{color:blue}.a{color:red}',
	);
});

test('a rule of the same selector between two copies still loses to the copy that is kept', () => {
	// The first copy loses to .a{color:blue}; the last one wins, as it did before.
	expect(withoutRepeatedRules('.a{color:red}.a{color:blue}.a{color:red}')).toBe(
		'.a{color:blue}.a{color:red}',
	);
});

test('rules that differ in a declaration, its order or !important all stay', () => {
	for (const css of [
		'.a{color:red}.a{color:blue}',
		'.a{color:red;margin:0}.a{margin:0;color:red}',
		'.a{color:red}.a{color:red!important}',
	])
		expect(withoutRepeatedRules(css)).toBe(css);
});

test('scoped component rules with different scope classes are never merged', () => {
	const css = '.card.s-1a2b{padding:4px}.card.s-3c4d{padding:4px}';
	expect(withoutRepeatedRules(css)).toBe(css);
});

test('copies under the same media query are merged, and a media block left empty goes', () => {
	expect(
		withoutRepeatedRules(
			'@media (width>=600px){.a{color:red}}.b{color:blue}@media (width>=600px){.a{color:red}}',
		),
	).toBe('.b{color:blue}@media (width>=600px){.a{color:red}}');
});

test('a rule under different conditions, or once inside and once outside one, stays in each', () => {
	for (const css of [
		'@media (width>=600px){.a{color:red}}@media (width>=900px){.a{color:red}}',
		'.a{color:red}@media (width>=600px){.a{color:red}}',
		'@supports (display:grid){.a{color:red}}.a{color:red}',
	])
		expect(withoutRepeatedRules(css)).toBe(css);
});

test('copies in the same named layer are merged, and the emptied layer block keeps its place in the layer order', () => {
	expect(
		withoutRepeatedRules('@layer base{.a{color:red}}@layer theme{.b{color:blue}}@layer base{.a{color:red}}'),
	).toBe('@layer base{}@layer theme{.b{color:blue}}@layer base{.a{color:red}}');
});

test('copies in different layers, anonymous layers, or a layer and no layer all stay', () => {
	for (const css of [
		'@layer base{.a{color:red}}@layer theme{.a{color:red}}',
		'@layer{.a{color:red!important}}@layer{.a{color:red!important}}',
		'@layer base{.a{color:red}}.a{color:red}',
	])
		expect(withoutRepeatedRules(css)).toBe(css);
});

test('layer statements and imports are never dropped', () => {
	const css = '@import url(a.css);@layer theme,base;.a{color:red}@layer theme,base;';
	expect(withoutRepeatedRules(css)).toBe(css);
});

test('an identical @font-face keeps its last copy; one with other descriptors stays', () => {
	const face = '@font-face{font-family:Probe;src:url(probe.woff2)format("woff2");unicode-range:U+590-5FF}';
	const other = '@font-face{font-family:Probe;src:url(probe-latin.woff2)format("woff2");unicode-range:U+0-FF}';
	expect(withoutRepeatedRules(`${face}${other}${face}`)).toBe(`${other}${face}`);
});

test('an identical @keyframes keeps its last copy, so the one defined last still wins', () => {
	const spin = '@keyframes spin{to{transform:rotate(1turn)}}';
	const other = '@keyframes spin{to{transform:rotate(2turn)}}';
	expect(withoutRepeatedRules(`${spin}${other}${spin}`)).toBe(`${other}${spin}`);
});

test('a nested style rule is compared whole', () => {
	expect(withoutRepeatedRules('.a{color:red;&:hover{color:blue}}.a{color:red;&:hover{color:blue}}')).toBe(
		'.a{color:red;&:hover{color:blue}}',
	);
	const css = '.a{color:red;&:hover{color:blue}}.a{color:red;&:hover{color:green}}';
	expect(withoutRepeatedRules(css)).toBe(css);
});

test('a stylesheet that does not parse cleanly is left as it is', () => {
	const css = '.a{color:red}.a{color:red}}';
	expect(withoutRepeatedRules(css)).toBe(css);
});
