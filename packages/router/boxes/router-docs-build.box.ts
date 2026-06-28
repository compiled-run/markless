import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { box } from '@async/witness';

const FIXTURE = '../../fixtures/router-docs';
const SERVER_ENTRY = `${FIXTURE}/.output/server/index.mjs`;
const BUNDLE_GRAPH = `${FIXTURE}/.output/public/build/bundle-graph.json`;
const WAIT_MS = 10_000;

export default box(
	{
		name: 'router docs build: built Nitro server serves the docs home page',
		tags: ['router', 'build', 'server'],
		modes: ['build'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, BUNDLE_GRAPH);

		const port = await freePort();
		const server = startBuiltServer(port);
		try {
			await waitForServer(port);
			const response = await fetch(`http://127.0.0.1:${port}/`);
			const html = await response.text();

			if (response.status !== 200) {
				throw new Error(
					`Expected built router docs server to return 200, saw ${response.status}: ${html}`,
				);
			}
			await expect.html.contains(html, '<h1>Arcade Router Docs</h1>');
			await expect.html.contains(html, 'This page is the docs fixture home route.');
			receipt.note(`built router docs server returned ${response.status} from /`);
		} finally {
			server.kill('SIGINT');
		}
		await receipt.capture('router docs built server served home page');
	},
);

function startBuiltServer(port: number): ChildProcessWithoutNullStreams {
	return spawn(process.execPath, [SERVER_ENTRY], {
		cwd: process.cwd(),
		env: {
			...process.env,
			NITRO_HOST: '127.0.0.1',
			NITRO_PORT: String(port),
		},
		stdio: 'pipe',
	});
}

async function waitForServer(port: number): Promise<void> {
	const started = Date.now();
	let lastError: unknown;
	while (Date.now() - started < WAIT_MS) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/`);
			await response.body?.cancel();
			return;
		} catch (error) {
			lastError = error;
			await delay(50);
		}
	}
	throw new Error(`Built router docs server did not start on ${port}: ${String(lastError)}`);
}

async function freePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => {
				if (address && typeof address === 'object') {
					resolve(address.port);
				} else {
					reject(new Error('Could not reserve a local port.'));
				}
			});
		});
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
