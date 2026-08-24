import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'pathe';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { renderToString, type SsrRenderable } from '@markless/web';

const repoRoot = resolve(import.meta.dirname, '../../..');
const componentsRoot = resolve(repoRoot, 'packages/headless/components');

// method.tsrx does not compile; the study excluded it and so does this sweep.
const EXCLUDED = new Set(['method.tsrx']);

function scenarioPaths(): ReadonlyArray<string> {
	const src = resolve(componentsRoot, 'src');
	if (!existsSync(src)) return [];
	return readdirSync(src, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((family) => {
			const dir = resolve(src, family.name, 'scenarios');
			if (!existsSync(dir)) return [];
			return readdirSync(dir)
				.filter((file) => file.endsWith('.tsrx') && !EXCLUDED.has(file))
				.map((file) => `src/${family.name}/scenarios/${file}`);
		})
		.sort();
}

let server: ViteDevServer;

beforeAll(async () => {
	// The same plugin `@markless/core/vite` re-exports, imported from the
	// package that owns it (this one) rather than through the facade.
	const { markless } = await import('../src/vite/index.ts');
	server = await createServer({
		root: componentsRoot,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true },
		plugins: [markless() as never],
	});
}, 120_000);

afterAll(async () => {
	await server?.close();
});

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
	return JSON.parse(match[1]) as never;
}

async function renderScenario(path: string): Promise<string> {
	const moduleExports = (await server.ssrLoadModule(`/${path}`)) as Record<
		string,
		SsrRenderable | undefined
	>;
	const artifact = moduleExports.default;
	if (!artifact) throw new Error(`${path}: no default export`);
	return renderToString(artifact, { executionLog: 'never' });
}

type Divergence = {
	readonly scenario: string;
	readonly hostNodeId: string;
	readonly index: number;
	readonly expected: string;
	readonly actual: string;
};

async function divergingHosts(path: string): Promise<ReadonlyArray<Divergence>> {
	const html = await renderScenario(path);
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

// The four shapes that exercise the census's hard cases: a repeat whose rows
// come from data, a toaster's custom content, an accordion, and a select whose
// parts nest several levels deep.
const REPRESENTATIVE = [
	'src/navbar/scenarios/items-from-data.tsrx',
	'src/toaster/scenarios/basic.tsrx',
	'src/accordion/scenarios/basic.tsrx',
	'src/select/scenarios/basic.tsrx',
] as const;

describe('render-order oracle', () => {
	test('representative scenarios: every served locator index names its own element', async () => {
		const found: Divergence[] = [];
		for (const path of REPRESENTATIVE) {
			found.push(...(await divergingHosts(path)));
		}
		expect(found).toEqual([]);
	}, 180_000);

	// Every scenario, not a sample. Kept unconditional because it shares the one
	// dev server the pin above already starts and runs beside the other node
	// files rather than on the critical path.
	test('full sweep: no scenario serves a locator index that names another element', async () => {
		const found: Divergence[] = [];
		for (const path of scenarioPaths()) {
			try {
				found.push(...(await divergingHosts(path)));
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
		expect(found).toEqual([]);
	}, 900_000);

	test('the sweep actually covers the family scenarios, so an empty pass is not vacuous', () => {
		// A silent drop to zero paths would make every assertion above trivially
		// true; the count is the witness that the sweep still has a corpus.
		expect(scenarioPaths().length).toBeGreaterThan(150);
	});
});
