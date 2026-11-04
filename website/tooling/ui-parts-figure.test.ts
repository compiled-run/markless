import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parts } from '../components/docs/ui-parts/parts.data.ts';
import { metaFamilies, metaFor } from '../components/docs/ui-meta/index.ts';
import { decorate, partsFigureModule, planParts } from './ui-parts-figure.ts';
import { readFileSync } from 'node:fs';

const demo = (family: string) => new URL(`../components/demos/ui/${family}/basic.tsrx`, import.meta.url).pathname;
const withDemo = Object.keys(parts).filter((family) => existsSync(demo(family)));

describe('parts figure', () => {
	it('rings each accordion part once, on its first element, and marks the repeated row', async () => {
		const source = readFileSync(demo('accordion'), 'utf8');
		const plan = await planParts('accordion', source, demo('accordion'), parts.accordion!);
		expect(plan.rings.map((ring) => ring.part)).toEqual(['root', 'item', 'itemlabel', 'itemtrigger', 'itemcontent']);
		expect(plan.rings.map((ring) => ring.number)).toEqual([1, 2, 3, 4, 5]);
		expect(plan.rings.filter((ring) => ring.row).map((ring) => ring.part)).toEqual(['item', 'itemlabel', 'itemtrigger', 'itemcontent']);
		expect(plan.rowMarks).toHaveLength(1);
		const render = decorate(source, plan);
		expect(render.startsWith('<accordion.root')).toBe(true);
		expect(render.match(/<span class="pf-ring/g)).toHaveLength(5);
		expect(render).toContain('<accordion.item data-pf-row');
	});

	it.each(withDemo)('builds a figure for %s that names every part and rings no hidden one', async (family) => {
		const module = await partsFigureModule({ family, stem: 'basic', file: demo(family), facts: parts[family]!, inkScreen: './s.tsrx', inkArt: './a.ts' });
		for (const fact of parts[family]!) expect(module).toContain(`<code>${family}.${fact.part}</code>`);
		const plan = await planParts(family, readFileSync(demo(family), 'utf8'), demo(family), parts[family]!);
		expect(plan.rings.some((ring) => parts[family]!.find((fact) => fact.part === ring.part)?.hidden)).toBe(false);
	});

	it.each(metaFamilies().filter((family) => metaFor(family).hooks))('lists exactly the ui-* attributes %s writes', (family) => {
		const written = [...new Set(parts[family]!.flatMap((fact) => fact.hooks))].sort();
		expect(Object.keys(metaFor(family).hooks!).sort()).toEqual(written);
	});
});
