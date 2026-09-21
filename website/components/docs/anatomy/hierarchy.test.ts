import { describe, expect, it } from 'vitest';
import { hierarchyFor } from './hierarchy.ts';
import { scenes } from './scenes.ts';

describe('anatomy composition tree', () => {
	it('keeps the representative accordion trigger inside its label', () => {
		const root = hierarchyFor('accordion', scenes.accordion!);
		expect(root.children.map((node) => node.part)).toEqual(['item']);
		const triggers = root.children.map((item) => item.children[0]!.children[0]!);
		expect(triggers.map((node) => node.part)).toEqual(['itemtrigger']);
		expect(triggers.map((node) => node.level)).toEqual([4]);
	});
	it('keeps the trigger outside the backdrop and the modal content inside it', () => {
		const root = hierarchyFor('modal', scenes.modal!);
		expect(root.children.map((node) => node.part)).toEqual(['trigger', 'backdrop']);
		expect(root.children[1]!.children[0]!.children.map((node) => node.part)).toEqual(['title', 'description', 'close']);
	});
	it('preserves separate instances of repeated items', () => {
		const items = hierarchyFor('table', scenes.table!).children.filter((node) => node.part === 'item');
		expect(items.map((node) => node.label)).toEqual(['item 1', 'item 2']);
		expect(items[0]!.shapeId).not.toBe(items[1]!.shapeId);
	});
	it('represents the depicted part names for each authored example', () => {
		for (const [family, scene] of Object.entries(scenes)) {
			const root = hierarchyFor(family, scene);
			const names = new Set<string>();
			const visit = (node: typeof root) => { names.add(node.part); node.children.forEach(visit); };
			visit(root);
			for (const shape of scene.shapes) expect(names.has(shape.part), family + '.' + shape.part).toBe(true);
		}
	});
});
