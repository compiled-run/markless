import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenes } from './scenes.ts';
import { familyOf } from '../api-derive/manifest.ts';

describe('anatomy drawings', () => {
	it('has a distinct drawing for each public component page', () => {
		const pages = new URL('../../../pages/markless/ui/', import.meta.url);
		for (const file of readdirSync(pages)) {
			const source = readFileSync(new URL(file, pages), 'utf8');
			if (!/^## (Anatomy|Structure)$/m.test(source) || file.startsWith('_')) continue;
			const family = file.replace('.mdx', '');
			expect(scenes[family], family).toBeDefined();
			expect(source, family).toContain('<AnatomyTable');
		}
	});

	it('annotates real exported parts and keeps their geometry within the drawing', () => {
		for (const [family, scene] of Object.entries(scenes)) {
			const parts = familyOf(family).parts.map((part) => part.part);
			expect(scene.shapes.length, family).toBeGreaterThan(1);
			for (const part of Object.keys(scene.descriptions ?? {})) expect(parts).toContain(part);
			for (const shape of scene.shapes) {
				expect(parts, family + '.' + shape.part).toContain(shape.part);
				expect(shape.x).toBeGreaterThanOrEqual(0);
				expect(shape.y).toBeGreaterThanOrEqual(0);
				expect(shape.x + shape.width).toBeLessThanOrEqual(640);
				expect(shape.y + shape.height).toBeLessThanOrEqual(420);
			}
		}
	});
});
