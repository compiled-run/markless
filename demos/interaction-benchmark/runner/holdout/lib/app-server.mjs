// Builds and serves one holdout app variant in a child process (lib/build-app.mjs under the markless()
// options hook). Output goes to a log file, not a pipe, like runner/lib/serve.mjs.
import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(here, 'markless-options-hook.mjs');
const BUILD = path.join(here, 'build-app.mjs');

export async function freePort() {
	const server = net.createServer();
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const { port } = server.address();
	await new Promise((r) => server.close(r));
	return port;
}

function child(root, mode, { port = 0, options, logName }) {
	const logPath = path.join(os.tmpdir(), `holdout-${logName}-${process.pid}.log`);
	const fd = openSync(logPath, 'w');
	const env = { ...process.env };
	if (options) env.HOLDOUT_MARKLESS_OPTIONS = JSON.stringify(options);
	else delete env.HOLDOUT_MARKLESS_OPTIONS;
	const proc = spawn(process.execPath, ['--import', HOOK, BUILD, root, mode, String(port)], {
		env,
		stdio: ['ignore', fd, fd],
		detached: true,
	});
	closeSync(fd);
	const read = () => {
		try {
			return readFileSync(logPath, 'utf8');
		} catch {
			return '';
		}
	};
	const events = () =>
		read()
			.split('\n')
			.filter((l) => l.startsWith('{"event"'))
			.map((l) => JSON.parse(l));
	let exited = null;
	proc.on('exit', (code) => (exited = code ?? 'signal'));
	const waitFor = async (event, timeoutMs) => {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const hit = events().find((e) => e.event === event);
			if (hit) return hit;
			if (exited !== null)
				throw new Error(
					`${mode} of ${root} exited (${exited}); log ${logPath}:\n${read().slice(-1500)}`,
				);
			await new Promise((r) => setTimeout(r, 250));
		}
		throw new Error(`${mode} of ${root}: no "${event}" within ${timeoutMs} ms; log ${logPath}`);
	};
	const stop = async () => {
		if (exited !== null) return;
		try {
			process.kill(-proc.pid, 'SIGTERM');
		} catch {}
		for (let i = 0; i < 30 && exited === null; i++)
			await new Promise((r) => setTimeout(r, 100));
		if (exited === null)
			try {
				process.kill(-proc.pid, 'SIGKILL');
			} catch {}
	};
	return { waitFor, stop, logPath, exited: () => exited };
}

/** Builds the app with the variant's forced markless() options (null = the app's own config). */
export async function buildApp(lane, variant, options) {
	const c = child(lane.root, 'build', { options, logName: `${lane.name}-${variant}-build` });
	const built = await c.waitFor('built', 15 * 60 * 1000);
	for (let i = 0; i < 100 && c.exited() === null; i++)
		await new Promise((r) => setTimeout(r, 100));
	await c.stop();
	return { ...built, log: c.logPath };
}

/** Serves the last build with `vite preview` on a free port; resolves once it answers. */
export async function serveApp(lane, variant, options) {
	const port = await freePort();
	const c = child(lane.root, 'serve', {
		port,
		options,
		logName: `${lane.name}-${variant}-serve`,
	});
	const serving = await c.waitFor('serving', 120000);
	const origin = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 80; i++) {
		try {
			const res = await fetch(origin + (lane.routes[0] ?? '/'), {
				signal: AbortSignal.timeout(2000),
			});
			await res.arrayBuffer();
			if (res.status < 500) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 250));
	}
	return { origin, serving, stop: c.stop, log: c.logPath };
}
