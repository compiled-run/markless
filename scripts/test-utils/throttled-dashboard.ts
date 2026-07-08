// THE APP STREAMS IN ITS OWN ORACLE (T116 gate 2, repeatable).
//
// Runs the markless-dashboard smoke + issues e2e suites against a preview
// build whose /api/view responses are ~300ms slow — slower than BOTH the
// server first-flush deadline (10ms => every page streams) and the client
// navigation settle deadline (250ms => holds and pending minimums engage on
// client swaps) — and captures evidence that the streaming path actually ran.
//
// Invocation (from the markless repo root; requires a built dashboard,
// i.e. `pnpm --dir ../design-system-manager/markless-dashboard build`):
//
//   node scripts/test-utils/throttled-dashboard.ts
//
// Env overrides: DSM_ROOT (../design-system-manager), THROTTLE_DELAY_MS (300),
// PREVIEW_PORT (4655), BACKEND_PORT (4720), PROXY_PORT (4620).
//
// Topology (no DSM source is touched; ports are the ONLY seam):
//   browser/SSR -> preview:4655 -> /api proxy -> :4620 latency proxy
//     -> :4720 real github-manager backend
// Phase A boots a scratch-rooted backend for a cold streamed-HTML capture;
// phase B lets the DSM playwright config own a freshly seeded backend on the
// same port (DSM_E2E_PORT) while smoke + issues run against the preview.
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
// Node-only repo script (never shipped): node:path is fine here; the
// runtime-agnostic pathe/ufo rule guards the framework packages.
import { join, resolve } from 'node:path';
import process from 'node:process';
import { startLatencyProxy } from './dsm-latency-proxy.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const dsmRoot = resolve(repoRoot, process.env.DSM_ROOT ?? '../design-system-manager');
const appDir = join(dsmRoot, 'markless-dashboard');
const delayMs = Number(process.env.THROTTLE_DELAY_MS ?? '300');
const previewPort = Number(process.env.PREVIEW_PORT ?? '4655');
const backendPort = Number(process.env.BACKEND_PORT ?? '4720');
const proxyPort = Number(process.env.PROXY_PORT ?? '4620');

const children: ChildProcess[] = [];
const scratchRoot = mkdtempSync(join(tmpdir(), 'markless-throttled-dashboard-'));
let proxyHandle: Awaited<ReturnType<typeof startLatencyProxy>> | undefined;

function fail(message: string): never {
	console.error(`\nthrottled-dashboard: FAIL — ${message}`);
	process.exitCode = 1;
	throw new Error(message);
}

async function portInUse(port: number): Promise<boolean> {
	return new Promise((resolvePort) => {
		const socket = net.connect({ host: '127.0.0.1', port }, () => {
			socket.destroy();
			resolvePort(true);
		});
		socket.on('error', () => resolvePort(false));
	});
}

async function waitFor(
	label: string,
	probe: () => Promise<boolean>,
	timeoutMs: number,
): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await probe().catch(() => false)) return;
		await new Promise((resolveWait) => setTimeout(resolveWait, 250));
	}
	fail(`timed out waiting for ${label}`);
}

function spawnChild(
	command: string,
	args: string[],
	options: { cwd: string; env?: Record<string, string> },
): ChildProcess {
	const child = spawn(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	children.push(child);
	return child;
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
	child.kill('SIGTERM');
	await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]);
	if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
	await exited;
}

async function cleanup(): Promise<void> {
	for (const child of [...children].reverse()) await stopChild(child).catch(() => {});
	await proxyHandle?.close().catch(() => {});
	rmSync(scratchRoot, { recursive: true, force: true });
	for (const port of [proxyPort, backendPort, previewPort]) {
		if (await portInUse(port)) console.error(`throttled-dashboard: port ${port} still in use`);
	}
}

// Streamed-HTML capture: one cold document request read chunk-by-chunk with
// timestamps — the witness that pending shell HTML flushed first and the
// settled arm template arrived LATER on the SAME response.
async function captureStreamedDocument(url: string) {
	const startedAt = Date.now();
	const response = await fetch(url);
	if (!response.ok || !response.body) fail(`GET ${url} -> ${response.status}`);
	const chunks: { at: number; text: string }[] = [];
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push({ at: Date.now() - startedAt, text: decoder.decode(value, { stream: true }) });
	}
	const html = chunks.map((chunk) => chunk.text).join('');
	const settledChunk = chunks.find((chunk) => chunk.text.includes('<template m:arm'));
	const firstChunkAt = chunks[0]?.at ?? -1;
	return { chunks: chunks.length, firstChunkAt, html, settledChunkAt: settledChunk?.at };
}

try {
	// Preflight: DSM present, app built, seams free.
	if (!existsSync(join(dsmRoot, 'apps/github-manager/server/main.ts'))) {
		fail(`github-manager backend not found under ${dsmRoot}`);
	}
	if (!existsSync(join(appDir, '.output'))) {
		fail(`markless-dashboard has no .output build — run: pnpm --dir ${appDir} build`);
	}
	for (const port of [proxyPort, backendPort, previewPort]) {
		if (await portInUse(port)) fail(`port ${port} is already in use — free it first`);
	}

	// Latency proxy on the app's hardwired /api seam.
	proxyHandle = await startLatencyProxy({
		listenPort: proxyPort,
		upstreamOrigin: `http://127.0.0.1:${backendPort}`,
		delayMs,
		delayPathPrefixes: ['/api/view'],
	});

	// Phase A backend: scratch-rooted copy of the e2e sandbox fixture (the
	// checked-in fixture itself is never written).
	const githubRoot = join(scratchRoot, 'github');
	cpSync(join(dsmRoot, 'e2e/fixtures/sandbox-github'), githubRoot, { recursive: true });
	const backend = spawnChild('node', ['apps/github-manager/server/main.ts'], {
		cwd: dsmRoot,
		env: {
			PORT: String(backendPort),
			DSM_GITHUB_ROOT: githubRoot,
			DSM_REGISTRY_ROOT: join(githubRoot, 'registry'),
			DSM_DASHBOARD_OUT: join(scratchRoot, 'dashboard.html'),
		},
	});
	await waitFor(
		`backend on :${backendPort}`,
		async () => (await fetch(`http://127.0.0.1:${backendPort}/api/view`)).ok,
		20_000,
	);

	// Preview WITHOUT preview.mjs (which would spawn its own backend on the
	// proxy's port); SSR /api fetches use the default 4620 origin = the proxy.
	// --host 127.0.0.1: vite preview defaults to localhost/::1 only, while the
	// backend, proxy, and oracle target URL all speak 127.0.0.1.
	spawnChild(
		'npx',
		['vite', 'preview', '--port', String(previewPort), '--strictPort', '--host', '127.0.0.1'],
		{ cwd: appDir },
	);
	await waitFor(
		`preview on :${previewPort}`,
		async () => (await fetch(`http://127.0.0.1:${previewPort}/`)).ok,
		30_000,
	);

	// Engagement evidence 1: a cold document request STREAMS — pending shell
	// first, settled <template m:arm> on the same response measurably later.
	const capture = await captureStreamedDocument(`http://127.0.0.1:${previewPort}/`);
	if (!capture.html.includes('<template m:arm') || !capture.html.includes('__mArm(')) {
		fail('cold document did not stream a settled arm template (no <template m:arm>/__mArm)');
	}
	if (capture.settledChunkAt === undefined || capture.settledChunkAt === capture.firstChunkAt) {
		fail('settled arm template did not arrive after the first flush');
	}
	if (capture.settledChunkAt - capture.firstChunkAt < 100) {
		fail(
			`settled template arrived only ${capture.settledChunkAt - capture.firstChunkAt}ms after the shell — throttle not engaged?`,
		);
	}
	const statsAfterCapture = proxyHandle.stats();
	if (statsAfterCapture.delayed < 1) fail('latency proxy delayed no /api/view requests');
	console.log(
		`\nthrottled-dashboard: STREAMING ENGAGED — shell chunk @${capture.firstChunkAt}ms, ` +
			`settled template @${capture.settledChunkAt}ms, ${capture.chunks} chunks on ONE response, ` +
			`${statsAfterCapture.delayed} delayed /api/view (+${delayMs}ms each)\n`,
	);

	// Phase B: free the backend port for playwright's own webServer (fresh
	// seeded root via DSM global-setup), then run the immutable oracles
	// against the throttled preview.
	await stopChild(backend);
	await waitFor(
		`port ${backendPort} to free`,
		async () => !(await portInUse(backendPort)),
		10_000,
	);

	const playwright = spawnChild(
		'npx',
		['playwright', 'test', 'e2e/smoke.spec.ts', 'e2e/issues.spec.ts'],
		{
			cwd: dsmRoot,
			env: {
				DSM_E2E_PORT: String(backendPort),
				DSM_E2E_TARGET_URL: `http://127.0.0.1:${previewPort}`,
			},
		},
	);
	const exitCode = await new Promise<number>((resolveExit) =>
		playwright.once('exit', (code) => resolveExit(code ?? 1)),
	);
	const statsAfterOracle = proxyHandle.stats();
	const oracleDelayed = statsAfterOracle.delayed - statsAfterCapture.delayed;
	if (exitCode !== 0) fail(`playwright exited ${exitCode} under throttle`);
	if (oracleDelayed < 1) fail('oracle run flowed zero requests through the throttle');
	console.log(
		`\nthrottled-dashboard: PASS — smoke+issues green with ${oracleDelayed} throttled ` +
			`/api/view during the oracle (delay ${delayMs}ms > 250ms nav deadline: hold/pending ` +
			'paths engaged on every client swap; > 10ms first-flush deadline: SSR streamed)\n',
	);
} finally {
	await cleanup();
}
