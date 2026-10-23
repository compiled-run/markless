import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';
import {
	build,
	createServer,
	optimizeDeps,
	resolveConfig,
	type InlineConfig,
	type Plugin,
} from 'vite';
import { afterEach, describe, expect, test } from 'vitest';
import {
	browserNodeGuard,
	importChain,
	isNodeBuiltinSpecifier,
	nodeGlobalUses,
} from '../src/vite/browser-node-guard.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function app(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(await realpath(tmpdir()), 'markless-node-guard-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	for (const [file, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), source);
	}
	return root;
}

const html = '<!doctype html><script type="module" src="./main.ts"></script>';

async function buildFailure(root: string, config: InlineConfig = {}): Promise<string> {
	try {
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			...config,
			build: { write: false, ...config.build },
			plugins: [browserNodeGuard(), ...(config.plugins ?? [])],
		});
	} catch (error) {
		return (error as Error).message;
	}
	return '';
}

describe('a browser build fails on Node code', () => {
	test('a direct node: import names the chain from the page entry', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { hostname } from 'node:os';\nconsole.log(hostname);",
		});
		const message = await buildFailure(root);
		expect(message).toContain('MARKLESS_NODE_IN_BROWSER');
		expect(message).toContain(
			['  index.html', '  → main.ts', '      imports "node:os", a Node built-in module'].join('\n'),
		);
		expect(message).toContain('Fix: move what the browser side needs');
	});

	test('a bare built-in hidden behind export * and a named re-export', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { PORT, run } from './cli/index.ts';\nconsole.log(PORT, run);",
			'cli/index.ts': "export * from './ports.ts';\nexport { run } from './spawn.ts';",
			'cli/ports.ts': "export * from './env.ts';\nexport const PORT = 5173;",
			'cli/env.ts': "import { platform } from 'os';\nexport const isMac = () => platform() === 'darwin';",
			'cli/spawn.ts': "import { spawn } from 'child_process';\nexport const run = () => spawn('ls');",
		});
		const message = await buildFailure(root);
		expect(message).toContain(
			[
				'  index.html',
				'  → main.ts',
				'  → cli/index.ts',
				'  → cli/ports.ts',
				'  → cli/env.ts',
				'      imports "os", a Node built-in module',
			].join('\n'),
		);
		expect(message).toContain(
			['  → cli/index.ts', '  → cli/spawn.ts', '      imports "child_process"'].join('\n'),
		);
	});

	test('a dynamic import() is marked in the chain', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "document.onclick = () => import('./lazy.ts');",
			'lazy.ts': "import { readFile } from 'node:fs/promises';\nexport { readFile };",
		});
		expect(await buildFailure(root)).toContain(
			['  → main.ts', '  → import() lazy.ts', '      imports "node:fs/promises"'].join('\n'),
		);
	});

	test('a package whose browser resolution is Node code', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { detect } from 'agent-detect';\nconsole.log(detect());",
			'node_modules/agent-detect/package.json': JSON.stringify({
				name: 'agent-detect',
				type: 'module',
				exports: { '.': './index.js' },
			}),
			'node_modules/agent-detect/index.js':
				"import { execFileSync } from 'node:child_process';\nexport const detect = () => execFileSync('ps');",
		});
		expect(await buildFailure(root)).toContain(
			[
				'  → main.ts',
				'  → node_modules/agent-detect/index.js',
				'      imports "node:child_process", a Node built-in module',
			].join('\n'),
		);
	});

	test('a package that reads a Node-only global', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { here } from 'cwd-pkg';\nconsole.log(here());",
			'node_modules/cwd-pkg/package.json': JSON.stringify({
				name: 'cwd-pkg',
				type: 'module',
				exports: './index.js',
			}),
			'node_modules/cwd-pkg/index.js': 'export const here = () => process.cwd();',
		});
		expect(await buildFailure(root)).toContain(
			['  → node_modules/cwd-pkg/index.js', '      uses `process` at 1:27'].join('\n'),
		);
	});

	test("a module its package's browser field removes is a Vite browser stand-in too", async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { load } from 'split-pkg';\nconsole.log(load);",
			'node_modules/split-pkg/package.json': JSON.stringify({
				name: 'split-pkg',
				main: './index.js',
				browser: { './server.js': false },
			}),
			'node_modules/split-pkg/index.js': "export { load } from './server.js';",
			'node_modules/split-pkg/server.js': 'export const load = () => 1;',
		});
		expect(await buildFailure(root)).toContain(
			['  → node_modules/split-pkg/index.js', '      imports a module its package removes'].join(
				'\n',
			),
		);
	});

	test('a built-in marked external still fails', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { cpus } from 'node:os';\nconsole.log(cpus);",
		});
		expect(
			await buildFailure(root, { build: { rolldownOptions: { external: ['node:os'] } } }),
		).toContain('imports "node:os"');
	});

	test('a web worker bundle', async () => {
		const root = await app({
			'index.html': html,
			'main.ts':
				"new Worker(new URL('./compile-worker.ts', import.meta.url), { type: 'module' });",
			'compile-worker.ts': "import { join } from 'node:path';\nself.postMessage(join('a', 'b'));",
		});
		expect(await buildFailure(root, { worker: { format: 'es' } })).toContain(
			['  compile-worker.ts', '      imports "node:path", a Node built-in module'].join('\n'),
		);
	});

	test('a library build for the browser, which leaves process.env to the app that bundles it', async () => {
		const root = await app({
			'index.ts': [
				"import { tmpdir } from 'node:os';",
				'export const debug = process.env.NODE_ENV !== "production";',
				'export const scratch = tmpdir;',
			].join('\n'),
		});
		const message = await buildFailure(root, {
			build: { lib: { entry: join(root, 'index.ts'), formats: ['es'] } },
		});
		expect(message).toContain('      imports "node:os", a Node built-in module');
		expect(message).not.toContain('uses `process`');
	});

	test('Node-only globals, each with its line and column', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': [
				'console.log(__dirname);',
				"export const bytes = Buffer.from('a');",
				'export const cwd = process.cwd();',
			].join('\n'),
		});
		const message = await buildFailure(root);
		expect(message).toContain('uses `__dirname` at 1:13');
		expect(message).toContain('uses `Buffer` at 2:22');
		expect(message).toContain('uses `process` at 3:20');
	});
});

describe('a browser build still passes', () => {
	test('code that only tests for Node, and process.env reads Vite replaces', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': [
				"export const mode = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';",
				"export const isNode = typeof process !== 'undefined' && process.versions?.node;",
				"export const bytes = typeof Buffer === 'undefined' ? new Uint8Array() : Buffer.from('a');",
				'export const own = ((process) => process.cwd())({ cwd: () => "/" });',
			].join('\n'),
		});
		expect(await buildFailure(root)).toBe('');
	});

	test('a plugin that answers a built-in with a browser module', async () => {
		const root = await app({
			'index.html': html,
			'main.ts': "import { readFileSync } from 'node:fs';\nconsole.log(readFileSync('a'));",
			'memory-fs.ts': 'export const readFileSync = (path: string) => path;',
		});
		const swap: Plugin = {
			name: 'memory-fs',
			enforce: 'pre',
			resolveId: (source) => (source === 'node:fs' ? join(root, 'memory-fs.ts') : null),
		};
		expect(await buildFailure(root, { plugins: [swap] })).toBe('');
	});

	test('a server build may import Node built-ins', async () => {
		const root = await app({
			'server.ts': "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;",
		});
		expect(
			await buildFailure(root, {
				build: { ssr: true, rolldownOptions: { input: join(root, 'server.ts') } },
			}),
		).toBe('');
	});
});

test('a dev server refuses the request with the chain it was reached through', async () => {
	const root = await app({
		'main.ts': "import { PORT } from './cli/index.ts';\nconsole.log(PORT);",
		'cli/index.ts': "export * from './agent.ts';\nexport const PORT = 5173;",
		'cli/agent.ts': "import { hostname } from 'node:os';\nexport const host = hostname;",
	});
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		server: { middlewareMode: true, ws: false },
		optimizeDeps: { noDiscovery: true, include: [] },
		plugins: [browserNodeGuard()],
	});
	cleanups.push(() => server.close());
	const client = server.environments.client!;
	await client.transformRequest('/main.ts');
	await client.transformRequest('/cli/index.ts');
	await expect(client.transformRequest('/cli/agent.ts')).rejects.toThrow(
		['  main.ts', '  → cli/index.ts', '  → cli/agent.ts', '      imports "node:os"'].join('\n'),
	);
});

test("the dev server's dependency pre-bundling refuses a package that reaches Node", async () => {
	const root = await app({
		'node_modules/agent-detect/package.json': JSON.stringify({
			name: 'agent-detect',
			type: 'module',
			exports: { '.': './index.js' },
		}),
		'node_modules/agent-detect/index.js':
			"export * from './probe.js';\nexport const name = 'agent-detect';",
		'node_modules/agent-detect/probe.js':
			"import { execFileSync } from 'node:child_process';\nexport const probe = () => execFileSync('ps');",
	});
	const config = await resolveConfig(
		{
			root,
			configFile: false,
			logLevel: 'silent',
			optimizeDeps: { include: ['agent-detect'], noDiscovery: true },
			plugins: [browserNodeGuard()],
		},
		'serve',
	);
	await expect(optimizeDeps(config, true)).rejects.toThrow(
		[
			'  node_modules/agent-detect/index.js',
			'  → node_modules/agent-detect/probe.js',
			'      imports "node:child_process", a Node built-in module',
		].join('\n'),
	);
});

describe('Node-only globals', () => {
	test.each([
		['__dirname', 'export const here = __dirname;'],
		['__filename', 'export const file = __filename;'],
		['global', 'export const root = global;'],
		['Buffer', "export const bytes = Buffer.from('a');"],
		['process', 'export const argv = process.argv;'],
		['require', "export const path = require.resolve('x');"],
		['require', 'export const load = (name) => require(name);'],
	])('%s in %s is a use', (name, code) => {
		expect(nodeGlobalUses(code).map((use) => use.name)).toEqual([name]);
	});

	test.each([
		"export const env = process.env.NODE_ENV;",
		"export const api = process.env.API_URL;",
		"export const hasBuffer = typeof Buffer !== 'undefined';",
		"export const node = typeof process === 'object' ? process.version : undefined;",
		"if (typeof __dirname === 'string') console.log(__dirname);",
		"export const dep = require('react');",
		'export function own(require, process) { return require(process.argv); }',
		'export const prop = { process: 1, Buffer: 2 }.process;',
		'// process.cwd() in a comment',
		"export const text = 'process.cwd()';",
	])('%s is not a use', (code) => {
		expect(nodeGlobalUses(code)).toEqual([]);
	});

});

test('the chain is the shortest path from an entry, with each dynamic step marked', () => {
	const importers: Record<string, { static: string[]; dynamic: string[] }> = {
		leaf: { static: ['barrel', 'deep'], dynamic: [] },
		barrel: { static: [], dynamic: ['page'] },
		deep: { static: ['deeper'], dynamic: [] },
		deeper: { static: ['page'], dynamic: [] },
		page: { static: [], dynamic: [] },
	};
	expect(
		importChain(
			{
				importers: (id) => importers[id]!,
				isEntry: (id) => id === 'page',
			},
			'leaf',
		),
	).toEqual([
		{ id: 'page', dynamic: false },
		{ id: 'barrel', dynamic: true },
		{ id: 'leaf', dynamic: false },
	]);
});

test('built-in specifiers come from Node, so a package that shares a prefix is not one', () => {
	expect(['node:os', 'bun:sqlite', 'fs', 'fs/promises', 'child_process'].every(isNodeBuiltinSpecifier)).toBe(
		true,
	);
	expect(['fsevents', 'os-utils', 'pathe', './fs'].some(isNodeBuiltinSpecifier)).toBe(false);
});
