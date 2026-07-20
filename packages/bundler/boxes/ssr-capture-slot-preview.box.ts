import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr';
const INDEX = `${FIXTURE}/dist/index.html`;
const GRAPH_BUTTON = '[data-capture-graph]';
const LITERAL_BUTTON = '[data-capture-literal]';
const GRAPH_OUTPUT = '[data-capture-graph-output]';
const LITERAL_OUTPUT = '[data-capture-literal-output]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr capture slots preview: built imported child resumes instance-bound callbacks',
		tags: ['ssr', 'build', 'preview', 'browser', 'capture-slot'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, project, expect, receipt }) => {
		await project.edit('prepare imported capture-slot fixture', {
			[`${FIXTURE}/src/root.tsrx`]: () => rootSource,
			[`${FIXTURE}/src/CaptureButton.tsrx`]: { create: childSource },
		});

		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const html = await preview.request('/');
		await expect.html.contains(html, 'Server spruce');
		await expect.html.contains(html, 'Server copper');
		await expect.html.contains(html, 'type="markless/state"');
		await expect.html.contains(html, 'type="markless/view"');
		await expect.html.contains(html, 'data-async-resumer');
		if (/<script\b[^>]*\bsrc=/.test(html)) {
			throw new Error('Expected SSR capture-slot HTML to keep startup JavaScript script-free.');
		}

		const page = await preview.browser.visit('/');

		await expect.page.text(page, GRAPH_BUTTON, 'Server spruce', WAIT);
		await expect.page.text(page, LITERAL_BUTTON, 'Server copper', WAIT);
		await expect.page.text(page, GRAPH_OUTPUT, 'none', WAIT);
		await expect.page.text(page, LITERAL_OUTPUT, 'none', WAIT);

		await page.click(GRAPH_BUTTON, WAIT);
		await expect.page.text(page, GRAPH_OUTPUT, 'graph:Server spruce:7:1', WAIT);
		await expect.page.text(page, LITERAL_OUTPUT, 'none', WAIT);

		await page.click(LITERAL_BUTTON, WAIT);
		await expect.page.text(page, LITERAL_OUTPUT, 'literal:Server copper:11:1', WAIT);
		await expect.page.text(page, GRAPH_OUTPUT, 'graph:Server spruce:7:1', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('ssr build preview resumed imported capture-slot bindings per instance');
	},
);

const childSource = `export function CaptureButton({ label, marker, count, onTrace }) @{
\tif (typeof window !== 'undefined') throw new Error('CaptureButton body executed during resume');

\t<button type="button" data-capture-graph={marker === 'graph'} data-capture-literal={marker === 'literal'} onClick={() => {
\t\tonTrace({ count, marker, source: label });
\t}}>{label}</button>
}
`;

const rootSource = `import { state } from '@markless/core';
import { CaptureButton } from './CaptureButton.tsrx';

export function App() @{
\tif (typeof window !== 'undefined') throw new Error('App body executed during resume');
\tlet graphLabel = state('Server spruce');
\tlet graphCalls = state(0);
\tlet literalCalls = state(0);
\tlet graphResult = state('none');
\tlet literalResult = state('none');

\t<main>
\t\t<CaptureButton marker="graph" label={graphLabel} count={7} onTrace={({ count, marker, source }) => { graphCalls++; graphResult = marker + ':' + source + ':' + count + ':' + graphCalls; }} />
\t\t<CaptureButton marker="literal" label="Server copper" count={11} onTrace={({ count, marker, source }) => { literalCalls++; literalResult = marker + ':' + source + ':' + count + ':' + literalCalls; }} />
\t\t<output data-capture-graph-output>{graphResult}</output>
\t\t<output data-capture-literal-output>{literalResult}</output>
\t</main>
}
`;
