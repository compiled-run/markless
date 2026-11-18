import { describe, expect, it } from 'vitest';
import { marklessOwningSurface } from '../../../web/src/prerender/owning-surface.ts';
import { createMdxRenderDataSurface } from '../../src/vite/runtime/mdx-route.ts';

type ChildSurface = Parameters<typeof createMdxRenderDataSurface>[1][number]['surface'];

const block = (own: string): ChildSurface => ({
	rootComponentName: 'Block',
	renderData: {},
	components: { Block: { name: 'Block', edges: [] }, [own]: { name: own, edges: [] } },
	imports: {},
});

describe('MDX render-data surface', () => {
	it('keeps each child component its own surface when several share a root component name', () => {
		const surface = createMdxRenderDataSurface(
			[0, 1, 2].map((componentIndex) => ({ kind: 'component', componentIndex })),
			['Feed', 'Search', 'Notes'].map((own, componentIndex) => ({
				componentIndex,
				hostPrefix: `m${componentIndex}:`,
				symbolPrefix: `m${componentIndex}:`,
				props: {},
				surface: block(own),
			})),
		);
		for (const [own, prefix] of [
			['Feed', 'm0:'],
			['Search', 'm1:'],
			['Notes', 'm2:'],
		] as const) {
			const reach = marklessOwningSurface(surface as never, own);
			expect(reach?.symbolPrefix).toBe(prefix);
			expect(reach?.surface.components[own]).toBeDefined();
		}
	});
});
