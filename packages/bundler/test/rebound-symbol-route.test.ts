import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '../src/vite/index.ts';

// The page composes RelayRow twice; each RelayRow hands its Row an arrow that calls
// RelayRow's own `onPicked` prop. Row invokes that arrow by instance path, so the
// page's route must answer it with the bound row carrying that edge's captures.
const fixtureRoot = fileURLToPath(new URL('./fixtures/rebound-route', import.meta.url));

const ROUTE_FUNCTION = /function marklessSsrLoadSymbolRoute\(symbolId\) \{[\s\S]*?\n\}/;
const REBOUND_IMPORT =
	/import \{ marklessReboundSymbol as marklessSsrLoadSymbolRouteRebound \} from "[^"]*rebound-symbol[^"]*";/;

async function pageCode(): Promise<string> {
	const server = await createServer({
		root: fixtureRoot,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, preTransformRequests: false },
		plugins: [markless() as never],
	});
	try {
		const result = await server.transformRequest('/page.tsrx');
		if (!result) throw new Error('page.tsrx did not transform');
		return result.code;
	} finally {
		await server.close();
	}
}

function runRoute(source: string) {
	const calls: string[] = [];
	const route = new Function(
		'__mxImport',
		'marklessLoadLocalSymbol',
		'marklessSsrLoadSymbolRouteRebound',
		`${source.replace(/\bimport\(/g, '__mxImport(')}\nreturn marklessSsrLoadSymbolRoute;`,
	)(
		async (specifier: string) => ({
			loadSymbol: (symbolId: string) => {
				calls.push(`import ${specifier} -> ${symbolId}`);
				return `child ${symbolId}`;
			},
		}),
		(symbolId: string) => {
			calls.push(`local ${symbolId}`);
			return `local ${symbolId}`;
		},
		(loaded: unknown, prefix: string, loadUnbound: () => unknown) => ({
			loaded,
			prefix,
			loadUnbound,
		}),
	) as (symbolId: string) => unknown;
	return { route, calls };
}

test('a child symbol its edge binds is answered by that edge bound row, under the edge prefix', async () => {
	const code = await pageCode();
	expect(code).toMatch(REBOUND_IMPORT);
	const routeSource = ROUTE_FUNCTION.exec(code)?.[0];
	if (!routeSource) throw new Error('page.tsrx emitted no symbol route function');
	const { route, calls } = runRoute(routeSource);

	const second = route('c1:symbol:0') as {
		loaded: unknown;
		prefix: string;
		loadUnbound: () => unknown;
	};
	expect(second.prefix).toBe('c1:');
	expect(second.loaded).toBe('local bound:symbol%3A0:component-edge%3A1');
	const first = route('c0:symbol:0') as { loaded: unknown };
	expect(first.loaded).toBe('local bound:symbol%3A0:component-edge%3A0');

	// The unbound child symbol stays reachable for a caller the bound row cannot place.
	await second.loadUnbound();
	expect(calls.at(-1)).toBe('import /relay-row.tsrx?import&markless-symbols -> symbol:0');

	// An id the edge does not bind still goes to the child module as spelled.
	await route('c1:bound:symbol%3A0:component-edge%3A0');
	expect(calls.at(-1)).toBe(
		'import /relay-row.tsrx?import&markless-symbols -> bound:symbol%3A0:component-edge%3A0',
	);
});
