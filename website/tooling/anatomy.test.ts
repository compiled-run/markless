import { describe, expect, it } from 'vitest';
import { expandAnatomyStyles } from './anatomy.ts';

describe('anatomy emphasis from exported part names', () => {
	it('generates persistent matching emphasis for arbitrary parts', () => {
		const result = expandAnatomyStyles('<style>@anatomy-selection;</style>', ['root', 'message', 'dismiss']);
		expect(result).not.toContain('@anatomy-selection;');
		for (const part of ['root', 'message', 'dismiss']) {
			expect(result).toContain(`[data-selected="${part}"] .callout[data-part="${part}"]`);
			expect(result).toContain(`[data-selected="${part}"] .part-shape[data-part="${part}"]`);
		}
		expect(result).toContain('opacity: 1');
	});
	it('leaves components without the anatomy directive alone', () => {
		expect(expandAnatomyStyles('<style>p { color: red; }</style>', ['root'])).toBe('<style>p { color: red; }</style>');
	});
	it('links each tree row to its own shape when parts repeat', () => {
		const result = expandAnatomyStyles('<style>@anatomy-selection; @anatomy-tree-selection;</style>', ['root', 'item'], ['example-0', 'example-1', 'example-2']);
		for (const id of ['example-0', 'example-1', 'example-2']) {
			expect(result).toContain(`[data-shape="${id}"] .part-shape[data-selection-id="${id}"]`);
			expect(result).toContain(`[data-shape="${id}"] .structure-row[data-shape="${id}"]`);
		}
		expect(result).not.toContain('[data-selected="item"]');
		expect(result).not.toContain('@anatomy-');
	});
});
