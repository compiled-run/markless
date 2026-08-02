import type { DevEnvironment, ViteDevServer } from 'vite';
import { createServerModuleRunner } from 'vite';
import type { SsrRenderable } from '../../../web/src/render-to-string.ts';
import { assemblePrerenderPageParts } from '../../../web/src/render-to-string.ts';
import { evaluateBuiltPageClosure } from '../../../web/src/prerender/evaluator.ts';
import {
	normalizeMarklessDevError,
	renderMarklessDevErrorDocument,
} from '../dev-error/index.ts';
import { injectDevClients } from './hmr.ts';

const APP_PLACEHOLDER = '<div id="app"></div>';

export function createDevPrerender(input: {
	readonly base: string;
	readonly entry: string;
	readonly serverEnvironment: string;
	readonly reportError: (environment: DevEnvironment | undefined, error: unknown) => void;
}) {
	let server: ViteDevServer | undefined;
	let runner: ReturnType<typeof createServerModuleRunner> | undefined;
	let renderDataHashKey = 'initial';
	let snapshot:
		| { readonly key: string; readonly value: Promise<PrerenderPageParts> }
		| undefined;
	const renderDataHashes = new Map<string, string>();
	let invalidationGeneration = 0;

	function updateHashes(hashes: ReadonlyMap<string, string>) {
		let changed = false;
		for (const [id, hash] of hashes) {
			if (renderDataHashes.get(id) === hash) continue;
			renderDataHashes.set(id, hash);
			changed = true;
		}
		if (changed) updateHashKey();
	}

	function invalidate(renderDataIds: readonly string[]) {
		invalidationGeneration += 1;
		for (const id of renderDataIds) {
			renderDataHashes.set(id, `invalidated-${invalidationGeneration}`);
		}
		updateHashKey();
	}

	function updateHashKey() {
		renderDataHashKey = [...renderDataHashes]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([id, hash]) => `${encodeURIComponent(id)}:${hash}`)
			.join('|');
		snapshot = undefined;
	}

	async function renderSnapshot(): Promise<PrerenderPageParts> {
		const key = renderDataHashKey;
		if (snapshot?.key === key) return snapshot.value;
		const value = renderPage();
		snapshot = { key, value };
		const rendered = await value;
		// An edit can land while the evaluator is awaiting authored data. Never let
		// that older render escape after HMR has invalidated its render-data inputs.
		return key === renderDataHashKey ? rendered : renderSnapshot();
	}

	async function renderPage(): Promise<PrerenderPageParts> {
		const environment = server?.environments[input.serverEnvironment] as
			| DevEnvironment
			| undefined;
		if (!environment) {
			throw new Error(
				`MARKLESS_DEV_PRERENDER_ENVIRONMENT_MISSING: ${input.serverEnvironment}`,
			);
		}
		runner ??= createServerModuleRunner(environment);
		const built = (await runner.import(input.entry)) as { readonly default?: SsrRenderable };
		if (!built.default) throw new Error('MARKLESS_PRERENDER_ENTRY_MISSING');
		const output = await evaluateBuiltPageClosure(built.default);
		return assemblePrerenderPageParts(built.default, output, {});
	}

	return {
		invalidate,
		updateHashes,
		async renderHtml(html: string) {
			try {
				if (!html.includes(APP_PLACEHOLDER)) {
					throw new Error(
						'MARKLESS_PRERENDER_CONTAINER_MISSING: expected exact #app dev placeholder',
					);
				}
				const page = await renderSnapshot();
				const withHead = page.head ? html.replace('</head>', `${page.head}</head>`) : html;
				return withHead.replace(APP_PLACEHOLDER, page.container);
			} catch (error) {
				const environment = server?.environments[input.serverEnvironment] as
					| DevEnvironment
					| undefined;
				input.reportError(environment, error);
				const payload = normalizeMarklessDevError(error, { id: input.entry });
				return injectDevClients(
					renderMarklessDevErrorDocument(payload, { base: input.base }),
					input.base,
				);
			}
		},
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
			nextServer.httpServer?.once('close', () => void runner?.close());
			nextServer.watcher?.once?.('close', () => void runner?.close());
		},
	};
}

type PrerenderPageParts = Awaited<ReturnType<typeof assemblePrerenderPageParts>>;
