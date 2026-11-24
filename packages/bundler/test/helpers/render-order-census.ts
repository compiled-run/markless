// The render-order oracle's census check, shared by the in-process pin and the sweep's child processes. Run as a
// script, it checks the scenario paths named in its arguments and prints their divergences as JSON: a process that
// exits is how the sweep lets go of what one dev server and the compile memo hold for every scenario it loaded.
import { resolve } from 'pathe';
import { createServer, type ViteDevServer } from 'vite';
import { renderToString, type SsrRenderable } from '@markless/web';
import { decodeProtocolPayloadLists } from '../../../serializer/src/protocol-record-templates.ts';

export const componentsRoot = resolve(import.meta.dirname, '../../../headless/components');

export async function censusServer(): Promise<ViteDevServer> {
	// The same plugin `@markless/core/vite` re-exports, imported from the
	// package that owns it (this one) rather than through the facade.
	const { markless } = await import('../../src/vite/index.ts');
	return createServer({
		root: componentsRoot,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true },
		plugins: [markless() as never],
	});
}

const VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// The oracle: the element census the runtime builds at resume time
// (packages/web/src/fns/dom-order.ts and resume-locators.ts both walk
// [root, ...descendants] in document preorder), reproduced from the served
// markup by a preorder start-tag scan.
function preorderElementScan(page: string): ReadonlyArray<{ tag: string; attrs: string }> {
	// The census root is the container the inline resumer closes onto
	// (`[data-async-container]`), not the page: head injections and preload links
	// stand before it and are not in any locator's index space.
	const containerAt = page.indexOf('<div data-async-container');
	if (containerAt < 0) throw new Error('no [data-async-container] root in the served html');
	const html = page.slice(containerAt);
	const out: Array<{ tag: string; attrs: string }> = [];
	const token = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|<\/[a-zA-Z][a-zA-Z0-9-]*\s*>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g;
	let match: RegExpExecArray | null;
	while ((match = token.exec(html))) {
		if (!match[1]) continue;
		const tag = match[1].toLowerCase();
		out.push({ tag, attrs: match[2] ?? '' });
		// Raw-text elements: their bodies are not markup, so skip to the close tag.
		if ((tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'title') && !match[3] && !VOID_ELEMENTS.has(tag)) {
			const close = html.toLowerCase().indexOf(`</${tag}`, token.lastIndex);
			if (close >= 0) token.lastIndex = close;
		}
	}
	return out;
}

function viewPayload(html: string): { locators: ReadonlyArray<{ hostNodeId: string; index: number; tagName: string }> } | null {
	const match = /<script type="markless\/view"[^>]*>([\s\S]*?)<\/script>/.exec(html);
	if (!match?.[1]) return null;
	return decodeProtocolPayloadLists('markless/view', JSON.parse(match[1])) as never;
}

async function renderScenario(server: ViteDevServer, path: string): Promise<string> {
	const moduleExports = (await server.ssrLoadModule(`/${path}`)) as Record<
		string,
		SsrRenderable | undefined
	>;
	const artifact = moduleExports.default;
	if (!artifact) throw new Error(`${path}: no default export`);
	return renderToString(artifact, { executionLog: 'never' });
}

export type Divergence = {
	readonly scenario: string;
	readonly hostNodeId: string;
	readonly index: number;
	readonly expected: string;
	readonly actual: string;
};

export async function divergingHosts(
	server: ViteDevServer,
	path: string,
): Promise<ReadonlyArray<Divergence>> {
	const html = await renderScenario(server, path);
	const view = viewPayload(html);
	if (!view) return [];
	const census = preorderElementScan(html);
	return view.locators.flatMap((locator) => {
		const element = census[locator.index];
		const expected = locator.tagName.toLowerCase();
		if (element && (expected === '*' || element.tag === expected)) return [];
		return [
			{
				scenario: path,
				hostNodeId: locator.hostNodeId,
				index: locator.index,
				expected,
				actual: element?.tag ?? '<past end of census>',
			},
		];
	});
}

export async function scenarioDivergences(
	server: ViteDevServer,
	paths: ReadonlyArray<string>,
): Promise<ReadonlyArray<Divergence>> {
	const found: Divergence[] = [];
	for (const path of paths) {
		try {
			found.push(...(await divergingHosts(server, path)));
		} catch (error) {
			found.push({
				scenario: path,
				hostNodeId: '<compile>',
				index: -1,
				expected: 'compiles',
				actual: String(error).slice(0, 200),
			});
		}
	}
	return found;
}

if (import.meta.main) {
	const server = await censusServer();
	try {
		process.stdout.write(JSON.stringify(await scenarioDivergences(server, process.argv.slice(2))));
	} finally {
		await server.close();
	}
}
