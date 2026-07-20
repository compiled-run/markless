import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr';
const GRAPH_BUTTON = '[data-capture-graph]';
const LITERAL_BUTTON = '[data-capture-literal]';
const GRAPH_OUTPUT = '[data-capture-graph-output]';
const LITERAL_OUTPUT = '[data-capture-literal-output]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr capture slots dev: imported child resumes instance-bound callbacks',
		tags: ['ssr', 'dev', 'browser', 'capture-slot'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await project.edit('prepare imported capture-slot fixture', {
			[`${FIXTURE}/src/root.tsrx`]: () => rootSource,
			[`${FIXTURE}/src/CaptureButton.tsrx`]: { create: childSource },
		});

		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		const page = await browser.visit('/');

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
		await receipt.capture('ssr dev resumed imported capture-slot bindings per instance');
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
