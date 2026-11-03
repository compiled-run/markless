import { expect, test } from 'vitest';
import type { PrerenderDataSurface } from '../src/prerender/evaluator.ts';
import { marklessOwningSurface } from '../src/prerender/owning-surface.ts';

type Edge = {
	readonly childComponentName: string;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
};

function surface(
	components: Record<string, ReadonlyArray<Edge>>,
	imports: Record<string, PrerenderDataSurface> = {},
	rootComponentName: string | null = null,
): PrerenderDataSurface {
	return {
		rootComponentName,
		renderData: {},
		components: Object.fromEntries(
			Object.entries(components).map(([name, edges]) => [name, { edges }]),
		),
		imports,
	} as unknown as PrerenderDataSurface;
}

const list = surface({ List: [] });

test('an import a local component renders is reached under that component’s own placement', () => {
	const search = surface(
		{
			Search: [{ childComponentName: 'Box', hostPrefix: 'c2:', symbolPrefix: 'c3:p5:' }],
			Box: [{ childComponentName: 'List', hostPrefix: 'c2:', symbolPrefix: 'c1:p2:' }],
		},
		{ List: list },
	);
	const page = surface(
		{ Page: [{ childComponentName: 'Search', hostPrefix: 'c0:', symbolPrefix: 'c0:' }] },
		{ Search: search },
		'Page',
	);

	expect(marklessOwningSurface(page, 'List')).toMatchObject({
		hostPrefix: 'c0:c2:c2:',
		symbolPrefix: 'c0:c3:p5:c1:p2:',
		edgePrefix: 'c0:c3:p5:',
	});
});

test('another export of the same module lends its placements to nothing it does not render', () => {
	const module = surface(
		{
			Other: [{ childComponentName: 'Helper', hostPrefix: 'c1:', symbolPrefix: 'c1:p2:' }],
			Helper: [{ childComponentName: 'List', hostPrefix: 'c4:', symbolPrefix: 'c4:' }],
			Used: [{ childComponentName: 'List', hostPrefix: 'c0:', symbolPrefix: 'c0:' }],
		},
		{ List: list },
	);
	const page = surface(
		{ Page: [{ childComponentName: 'Used', hostPrefix: 'c3:', symbolPrefix: 'c3:' }] },
		{ Used: module },
		'Page',
	);

	expect(marklessOwningSurface(page, 'List')?.symbolPrefix).toBe('c3:c0:');
});
