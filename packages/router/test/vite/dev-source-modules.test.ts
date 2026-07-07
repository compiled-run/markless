import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import { router } from '../../src/vite/index.ts';

// Dev source-module requests (T104 living-proof regression): Vite's glob
// imports emit ROOT-RELATIVE page-module URLs (/pages/r/[repo]/index.tsrx
// ?import&markless-resume). The dev server does not recognize the .tsrx
// extension as a module request at that shape, so the request falls through
// to the nitro route handler and 404s — killing the first full-resume wake
// of every dev interaction. The router's dev middleware must rewrite such
// requests to the /@fs/<absolute> form, which Vite serves.

type MiddlewareHandler = (req: { url?: string }, res: unknown, next: () => void) => void;

function devSourceModuleHandler(root: string): MiddlewareHandler {
	const plugins = router().flat() as Array<{
		readonly name?: string;
		readonly configResolved?: (config: unknown) => void;
		readonly configureServer?: (server: unknown) => void;
	}>;
	const plugin = plugins.find(
		(candidate) => candidate.name === 'markless-router:dev-source-module-requests',
	);
	expect(plugin, 'dev source-module request plugin registered by router()').toBeDefined();
	plugin!.configResolved?.({ root, command: 'serve' });
	let handler: MiddlewareHandler | undefined;
	plugin!.configureServer?.({
		middlewares: {
			use(use: MiddlewareHandler) {
				handler = use;
			},
		},
	});
	expect(handler, 'middleware installed on configureServer').toBeDefined();
	return handler!;
}

function appRootWithPage(): string {
	const root = mkdtempSync(join(tmpdir(), 'markless-router-dev-source-'));
	mkdirSync(join(root, 'pages/r/[repo]'), { recursive: true });
	writeFileSync(
		join(root, 'pages/r/[repo]/index.tsrx'),
		'export default function Page() @{ <p /> }',
	);
	return root;
}

test('rewrites root-relative .tsrx module requests to the servable /@fs form', () => {
	const root = appRootWithPage();
	const handler = devSourceModuleHandler(root);

	const req = { url: '/pages/r/[repo]/index.tsrx?import&markless-resume' };
	let nexted = false;
	handler(req, undefined, () => {
		nexted = true;
	});

	expect(nexted).toBe(true);
	expect(req.url).toBe(`/@fs${root}/pages/r/[repo]/index.tsrx?import&markless-resume`);
});

test('leaves page routes and missing files untouched', () => {
	const root = appRootWithPage();
	const handler = devSourceModuleHandler(root);

	// A real app route: no extension, no module query — nitro must keep it.
	const route = { url: '/r/alpha-project-a' };
	handler(route, undefined, () => {});
	expect(route.url).toBe('/r/alpha-project-a');

	// A .tsrx URL without a module-request query stays a route candidate.
	const bare = { url: '/pages/r/[repo]/index.tsrx' };
	handler(bare, undefined, () => {});
	expect(bare.url).toBe('/pages/r/[repo]/index.tsrx');

	// A module query for a file that does not exist under root: untouched, so
	// the 404 stays honest instead of becoming a confusing @fs denial.
	const missing = { url: '/pages/nope.tsrx?import&markless-resume' };
	handler(missing, undefined, () => {});
	expect(missing.url).toBe('/pages/nope.tsrx?import&markless-resume');
});
