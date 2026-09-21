import { describe, expect, it } from 'vitest';
import { deriveAnatomy } from './model.ts';
import type { AnatomyScene } from './scenes.ts';
import { familyOf, type ManifestFamily } from '../api-derive/manifest.ts';
import { scenes } from './scenes.ts';

const metadata: ManifestFamily = { parts: [
	{ part: 'root', component: 'NoticeRoot', doc: 'Holds the notice.', props: [] },
	{ part: 'message', component: 'NoticeMessage', doc: 'The message to read.', props: [] },
	{ part: 'dismiss', component: 'NoticeDismiss', doc: 'Closes the notice.', props: [] },
] };
const scene: AnatomyScene = { caption: 'A notice.', shapes: [
	{ part: 'root', x: 100, y: 100, width: 300, height: 100, text: '', kind: 'line' },
	{ part: 'message', x: 120, y: 120, width: 200, height: 30, text: 'Saved', kind: 'text' },
] };

describe('anatomy derived from component metadata', () => {
	it('builds the existing drawings against their owning component declarations', () => {
		for (const [family, drawing] of Object.entries(scenes)) {
			const anatomy = deriveAnatomy(family, familyOf(family), drawing);
			expect(anatomy.parts.length).toBe(familyOf(family).parts.length);
			expect(anatomy.root.name).toBe(`${family}.root`);
		}
	});
	it('uses exported names and docs for callouts and supporting parts', () => {
		const anatomy = deriveAnatomy('notice', metadata, scene);
		expect(anatomy.callouts.map((part) => part.name).sort()).toEqual(['notice.message', 'notice.root']);
		expect(anatomy.supporting.map((part) => [part.name, part.description])).toEqual([
			['notice.dismiss', 'Closes the notice.'],
		]);
	});

	it('centres chevrons independently of font glyph baselines', () => {
		const drawing = { ...scene, shapes: scene.shapes.map((shape) => shape.part === 'message'
			? { ...shape, icon: 'chevron-down' as const } : shape) };
		const shape = deriveAnatomy('notice', metadata, drawing).shapes.find((shape) => shape.part === 'message')!;
		expect(shape.iconTransform).toBe('translate(126 123)');
		expect(shape.textX).toBe(154);
		expect(shape.textAnchor).toBe('start');
	});

	it('includes new exported parts without editing the drawing or reading order', () => {
		const updated = { parts: [...metadata.parts, { part: 'icon', component: 'NoticeIcon', doc: 'The status icon.', props: [] }] };
		const anatomy = deriveAnatomy('notice', updated, scene, ['root', 'message']);
		expect(anatomy.parts.map((part) => part.part)).toEqual(['root', 'message', 'dismiss', 'icon']);
		expect(anatomy.supporting.map((part) => part.name)).toContain('notice.icon');
	});

	it('rejects annotations for a part the component does not export', () => {
		expect(() => deriveAnatomy('notice', metadata, {
			...scene, shapes: [...scene.shapes, { ...scene.shapes[1]!, part: 'typo' }],
		})).toThrow('notice.typo');
	});
});
