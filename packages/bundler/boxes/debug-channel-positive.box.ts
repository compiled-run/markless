import { box, type BuildHandle, type PipelineApi } from '@async/witness';
import type { Plugin } from 'vite';
import {
	appendWitnessVerdict,
	invalidateBundlerAnalyzerReceipt,
	writeBundlerAnalyzerReceipt,
} from './witness-verdict.ts';

const FIXTURES = ['fixtures/vite-csr', 'fixtures/vite-ssr'] as const;
const WAIT = { timeoutMs: 10_000 };
const BOX = {
	name: 'debug channel: flagged CSR and SSR interaction paths are visible',
	tags: ['debug-channel', 'build', 'preview', 'browser'],
};

export default box(
	{
		...BOX,
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		await invalidateBundlerAnalyzerReceipt('debug-channel-positive');
		for (const fixture of FIXTURES) {
			const flagged = await buildFixture(pipeline, fixture, true);
			const preview = await previewFixture(pipeline, flagged, fixture, true);
			const page = await preview.browser.visit('/');
			await expect.page.text(page, '[data-counter]', '0', WAIT);
			const debugResult = expectedDebugResult(fixture);
			await expect.page.attribute(page, 'html', 'data-markless-debug', debugResult, WAIT);
			await page.click('[data-counter]', WAIT);
			await expect.page.text(page, '[data-counter]', '1', WAIT);
			receipt.note(`${fixture}: ${debugResult}`);
			await preview.close();
		}
		await receipt.capture('flagged debug channel proof');
		await appendWitnessVerdict({
			...BOX,
			passed: true,
			receiptPath: '.witness/receipts/<run>/receipt.json',
		});
		await writeBundlerAnalyzerReceipt({
			name: 'debug-channel-positive',
			identity: { matrix: 'bundler-debug-channel-positive-v1' },
			results: [{ id: 'MLA-EXT-WITNESS', status: 'pass', details: [] }],
		});
	},
);

export async function buildFixture(
	pipeline: PipelineApi,
	fixture: string,
	debug: boolean,
): Promise<BuildHandle> {
	return pipeline.build({
		config: (config) => ({
			...config,
			root: `${config.root}/${fixture}`,
			configFile: `${config.root}/${fixture}/vite.config.ts`,
			plugins: [...(config.plugins ?? []), debugChannelReporter(debug)],
			...(debug ? { mode: 'debug-channel' } : {}),
		}),
	});
}

export function previewFixture(
	pipeline: PipelineApi,
	build: BuildHandle,
	fixture: string,
	debug: boolean,
) {
	return pipeline.preview(build, {
		config: (config) => ({
			...config,
			configFile: `${config.root}/${fixture}/vite.config.ts`,
			plugins: [...(config.plugins ?? []), debugChannelReporter(debug)],
			...(debug ? { mode: 'debug-channel' } : {}),
		}),
	});
}

const debugChannelReporterSource = (debug: boolean) =>
	debug
		? `(() => {
	const report = () => {
		const channel = window.__MARKLESS_DEBUG__;
		const element = document.querySelector('[data-counter]');
		if (!channel || !element) return setTimeout(report, 10);
		const explanation = channel.explainInteraction(element, 'click');
		document.documentElement.setAttribute('data-markless-debug',
			[channel.version, channel.containers[0]?.phase, explanation.kind].join(':'));
	};
	if (document.readyState === 'complete') report();
	else window.addEventListener('load', report, { once: true });
	})()`
		: `(() => {
	// the channel global's name is assembled at runtime so this baked-in test
	// probe never appears as a debug sentinel in built artifacts
	const key = ['__MARKLESS', 'DEBUG__'].join('_');
	const report = () => document.documentElement.setAttribute(
		'data-markless-debug-absent', String(!Object.prototype.hasOwnProperty.call(window, key)));
	if (document.readyState === 'complete') report();
	else window.addEventListener('load', report, { once: true });
	})()`;

export function debugChannelReporter(debug: boolean): Plugin {
	const source = debugChannelReporterSource(debug);
	return {
		name: 'test:debug-channel-reporter',
		enforce: 'pre',
		transformIndexHtml() {
			return [{ tag: 'script', injectTo: 'body', children: source }];
		},
		configurePreviewServer(server) {
			server.middlewares.use((_request, response, next) => {
				const end = response.end.bind(response);
				response.end = ((chunk?: string | Uint8Array, ...args: unknown[]) => {
					const contentType = String(response.getHeader('content-type') ?? '');
					if (chunk && contentType.includes('text/html')) {
						const html =
							typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
						const injected = `${html}<script>${source}</script>`;
						response.removeHeader('content-length');
						return end(new TextEncoder().encode(injected), ...(args as []));
					}
					return end(chunk, ...(args as []));
				}) as typeof response.end;
				next();
			});
		},
	};
}

export const expectedDebugResult = (fixture: string) =>
	// vite-csr's optimized chunk renderer attaches this static event directly;
	// standard native-chunk CSR paths are covered by the web delegated-trigger
	// registration test.
	fixture.endsWith('vite-csr') ? '1:csr:direct-csr' : '1:ssr-inline:inline-resumer';
