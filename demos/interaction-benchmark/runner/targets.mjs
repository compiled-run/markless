import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appsDir = fileURLToPath(new URL('../apps/', import.meta.url));
const GIT = fs.existsSync('/opt/homebrew/bin/git') ? '/opt/homebrew/bin/git' : 'git';

/**
 * Local entrants: the app's own production server on `port`, fronted by runner/proxy.mjs on
 * `port + 1000` (same compression and HTTP version for every entrant). Commands come from each
 * apps/<name>/BENCH.md. `versionPackages` are read from the app's installed node_modules.
 */
export const targets = {
	markless: {
		serve: { command: 'node', args: ['.output/server/index.mjs'], port: 4410 },
		versionPackages: ['@markless/core', '@markless/router', '@markless/typescript-plugin', 'nitro', 'vite-plus'],
	},
	'markless-viewport': {
		entrant: 'markless',
		variant: 'viewport',
		serve: { command: 'node', args: ['.output/server/index.mjs'], port: 4415 },
		versionPackages: ['@markless/core', '@markless/router', '@markless/typescript-plugin', 'nitro', 'vite-plus'],
	},
	qwik: {
		serve: { command: 'node', args: ['scripts/serve.mjs'], port: 4420 },
		versionPackages: ['@qwik.dev/core', '@qwik.dev/router', 'vite'],
	},
	'qwik-tuned': {
		entrant: 'qwik',
		variant: 'tuned',
		serve: { command: 'node', args: ['scripts/serve.mjs'], port: 4425 },
		versionPackages: ['@qwik.dev/core', '@qwik.dev/router', 'vite'],
	},
	octane: {
		serve: { command: 'pnpm', args: ['run', 'preview'], port: 4431 },
		versionPackages: ['octane', '@octanejs/vite-plugin', '@octanejs/app-core', '@octanejs/adapter-vercel', 'vite'],
	},
	'react-router': {
		serve: { command: 'node', args: ['scripts/start.mjs'], port: 4440 },
		versionPackages: ['react-router', '@react-router/dev', '@react-router/node', '@react-router/serve', 'react', 'react-dom', 'vite', '@vercel/react-router'],
	},
	remix3: {
		serve: { command: 'node', args: ['--import', 'remix/node-tsx', 'server.ts'], port: 4450, env: { NODE_ENV: 'production' } },
		versionPackages: ['remix'],
	},
	solidstart: {
		serve: { command: 'node', args: ['.output/server/index.mjs'], port: 4461 },
		versionPackages: ['solid-js', '@solidjs/web', '@solidjs/router', '@solidjs/vite-plugin', 'nitro', 'vite'],
	},
	sveltekit: {
		serve: { command: 'pnpm', args: ['run', 'preview'], port: 4470 },
		versionPackages: ['svelte', '@sveltejs/kit', '@sveltejs/adapter-vercel', 'vite'],
	},
	ripple: {
		serve: { command: 'node', args: ['dist/server/entry.js'], port: 4480 },
		versionPackages: ['ripple', '@ripple-ts/vite-plugin', '@ripple-ts/adapter-vercel', 'vite'],
	},
};

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}

export function resolveVersions(name) {
	const appDir = path.join(appsDir, name);
	const pkg = readJson(path.join(appDir, 'package.json'));
	const declared = { ...pkg?.devDependencies, ...pkg?.dependencies };
	const wanted = targets[name]?.versionPackages ?? Object.keys(declared);
	const versions = {};
	for (const dep of wanted) {
		const installed = readJson(path.join(appDir, 'node_modules', dep, 'package.json'))?.version;
		if (installed) versions[dep] = installed;
		else if (declared[dep]) versions[dep] = `declared:${declared[dep]}`;
	}
	return Object.keys(versions).length ? versions : { unresolved: `no package versions found under ${appDir}` };
}

export function resolveSourceRevision(name) {
	const appDir = path.join(appsDir, name);
	try {
		const git = (...args) => execFileSync(GIT, ['-C', appDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		const head = git('rev-parse', '--short=12', 'HEAD');
		return git('status', '--porcelain', '--', '.') ? `${head}-dirty` : head;
	} catch {
		return 'unknown';
	}
}

/**
 * options.urls: name -> URL visited directly (deployments). options.upstreams: name -> URL of an
 * already-running local server, fronted by the proxy. options.proxyPorts: name -> proxy port.
 * options.transport: 'proxy' (default) or 'direct' for registry-served targets.
 */
export function resolveTargets(names, options = {}) {
	const { urls = {}, upstreams = {}, proxyPorts = {}, transport = 'proxy', variants = {}, renderModes = {}, sourceRevisions = {} } = options;
	return names.map((name) => {
		const base = targets[name];
		const common = {
			name,
			entrant: base?.entrant ?? name,
			appDir: base ? path.join(appsDir, name) : null,
			variant: variants[name] ?? base?.variant ?? 'default',
			renderMode: renderModes[name] ?? 'ssr',
			sourceRevision: sourceRevisions[name] ?? (base ? resolveSourceRevision(name) : 'unknown'),
			versions: base ? resolveVersions(name) : { unresolved: 'target not in registry' },
		};
		if (urls[name]) {
			const host = new URL(urls[name]).hostname.endsWith('.vercel.app') ? 'vercel' : 'local';
			return { ...common, url: urls[name], transport: 'direct', host };
		}
		if (upstreams[name]) {
			const port = proxyPorts[name] ?? Number(new URL(upstreams[name]).port) + 1000;
			return { ...common, upstream: upstreams[name], proxyPort: port, transport: 'proxy', host: 'controlled' };
		}
		if (!base) throw new Error(`unknown target "${name}" (known: ${Object.keys(targets).join(', ')}); pass --target-url or --target-upstream`);
		const serve = { ...base.serve, cwd: path.join(appsDir, name) };
		const upstream = `http://127.0.0.1:${serve.port}`;
		if (transport === 'direct') return { ...common, serve, url: upstream, transport: 'direct', host: 'local' };
		return { ...common, serve, upstream, proxyPort: proxyPorts[name] ?? serve.port + 1000, transport: 'proxy', host: 'controlled' };
	});
}
