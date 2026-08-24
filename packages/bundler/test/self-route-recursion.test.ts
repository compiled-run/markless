import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';
import { emitPrerenderTriggerGroupModule } from '../src/trigger-groups.ts';
import type { SourceLazySymbolRoute } from '../src/source-module.ts';

// `tree/scenarios/deep.tsrx` is a component that composes ITSELF while every
// level roots a widget instance of an imported family. Its route table (measured
// off this transform) mixes all three route kinds, so it is the shape that
// catches a route which strips one segment and stops.
const deepFilename = fileURLToPath(
	new URL('../../headless/components/src/tree/scenarios/deep.tsrx', import.meta.url),
);

const ROUTE_FUNCTION = /function marklessSsrLoadSymbolRoute\(symbolId\) \{[\s\S]*?\n\}/;

async function deepRouteFunctionSource(): Promise<string> {
	const result = await transformTsrxModule({
		filename: deepFilename,
		source: readFileSync(deepFilename, 'utf8'),
		environment: 'client',
	});
	const match = ROUTE_FUNCTION.exec(result.code);
	if (!match) throw new Error('deep.tsrx emitted no symbol route function');
	return match[0];
}

type RouteHarness = {
	readonly route: (symbolId: string) => Promise<unknown>;
	/** `<import specifier> -> <symbol id handed to that module>`, in call order. */
	readonly imported: string[];
	/** Symbol ids that fell through to this module's OWN resolver. */
	readonly local: string[];
};

// Runs the emitted bytes rather than matching them: the defect was behavioral
// (a live page threw `Unknown async symbol c0:p4:p5:c0:p1:symbol:2`) while the
// emitted text read as intended.
function runRouteFunction(source: string): RouteHarness {
	const imported: string[] = [];
	const local: string[] = [];
	const harness: { route?: (symbolId: string) => Promise<unknown> } = {};
	const route = new Function(
		'__mxImport',
		'marklessLoadLocalSymbol',
		`${source.replace(/\bimport\(/g, '__mxImport(')}\nreturn marklessSsrLoadSymbolRoute;`,
	)(
		async (specifier: string) => ({
			loadSymbol: (symbolId: string) => {
				imported.push(`${specifier} -> ${symbolId}`);
				// A module's `?markless-symbols` variant exports ITS route function as
				// `loadSymbol`, so re-entering this page's own symbols re-enters the
				// same table. Everything else is a leaf child module.
				return specifier === './deep.tsrx?markless-symbols'
					? harness.route!(symbolId)
					: `served ${symbolId}`;
			},
		}),
		(symbolId: string) => {
			local.push(symbolId);
			return `local ${symbolId}`;
		},
	) as (symbolId: string) => Promise<unknown>;
	harness.route = route;
	return { route, imported, local };
}

test('a same-module route re-enters the route table instead of stopping after one strip', async () => {
	const { route, imported, local } = runRouteFunction(await deepRouteFunctionSource());

	// The id a level-2 widget part mints on the live page: the page composes
	// FileNode (`c6:p7:`), FileNode composes itself (`c0:p4:p5:`), and the leaf
	// symbol belongs to the imported tree family (`c0:p1:`).
	const served = await route('c6:p7:c0:p4:p5:c0:p1:symbol:2');

	expect(imported).toEqual([
		'./deep.tsrx?markless-symbols -> c0:p1:symbol:2',
		'../../index.ts?markless-symbols -> symbol:2',
	]);
	// Never dead-ends in the page's own table, which is where the thrown
	// `Unknown async symbol` came from.
	expect(local).toEqual([]);
	expect(served).toBe('served symbol:2');
});

test('an id no route claims still reaches the closing fallback', async () => {
	const { route, imported, local } = runRouteFunction(await deepRouteFunctionSource());

	expect(await route('symbol:0')).toBe('local symbol:0');
	expect(local).toEqual(['symbol:0']);
	expect(imported).toEqual([]);
});

test('the self branch recurses while child-module branches keep their bytes', async () => {
	const source = await deepRouteFunctionSource();

	expect(source).toContain(
		'	if (symbolId.startsWith("c6:p7:")) {\n		return marklessSsrLoadSymbolRoute(symbolId.slice(6));\n	}',
	);
	// Unchanged: a route naming a child module still imports that module's
	// symbols variant and hands it the remainder.
	expect(source).toContain(
		'	if (symbolId.startsWith("c0:p1:")) {\n		return import("../../index.ts?markless-symbols").then((mod) => mod.loadSymbol ? mod.loadSymbol(symbolId.slice(6)) : Promise.reject(new Error(`Unknown child async symbol ${symbolId}`)));\n	}',
	);
	expect(source.endsWith('	return marklessLoadLocalSymbol(symbolId);\n}')).toBe(true);
});

// The measured deep.tsrx table: one self route, one self-recursive route (the
// cyclic FileNode edge names this module so it re-enters the table), and the
// imported family's routes.
const DEEP_ROUTES: ReadonlyArray<SourceLazySymbolRoute> = [
	{ prefix: 'c0:p4:p5:', importSource: './deep.tsrx' },
	{ prefix: 'c0:p1:', importSource: '../../index.ts' },
	{ prefix: 'c6:p7:', self: true },
];

test('a prerendered page routes its same-module children too', async () => {
	const source = emitPrerenderTriggerGroupModule({
		group: {
			id: 'host:trigger:click',
			hostNodeId: 'host:trigger',
			eventName: 'click',
			hostIndex: 1,
			hostTagName: 'button',
			graphNodeIds: [],
			symbolIds: ['symbol:0'],
			state: { version: 1, cells: [], computed: [] },
			view: {
				version: 1,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
		},
		symbols: [{ id: 'symbol:0', chunk: './open.js', exportName: 'toggle' }],
		boundRows: [],
		symbolRoutes: DEEP_ROUTES,
	});

	// The self route survives into the prerendered page and recurses, so a level-2
	// id routes there exactly as it does on the CSR page.
	expect(source).toContain(
		'\tif (symbolId.startsWith("c6:p7:")) {\n\t\treturn loadSymbol(symbolId.slice(6));\n\t}',
	);
	expect(source).toContain('import("./deep.tsrx?markless-symbols")');
	expect(source).toContain('import("../../index.ts?markless-symbols")');
	expect(source).toContain('\treturn marklessLoadLocalSymbol(symbolId);');
});
