import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const owned = new Set();
process.on('exit', () => {
	for (const pid of owned) {
		try {
			process.kill(-pid, 'SIGKILL');
		} catch {}
	}
});

async function reachable(url) {
	try {
		const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
		await res.arrayBuffer();
		return true;
	} catch {
		return false;
	}
}

/** Starts a target's serve command unless something already answers on its port; resolves once it responds. */
export async function startTarget(target, { timeoutMs = 60000, log = () => {} } = {}) {
	const url = target.upstream ?? target.url;
	if (await reachable(url)) {
		log(`${target.name}: reusing the server already answering at ${url}; this run does not own it, and if its owner stops it the proxy answers 502 (connect ECONNREFUSED)`);
		return { stop: async () => {}, spawned: false };
	}
	const { command, args = [], cwd, port, env = {} } = target.serve;
	// Server output goes to a file, not a pipe: srvx/Nitro spin at 100% CPU on EPIPE once an orphaned server's pipe breaks.
	const logPath = join(tmpdir(), `mlbench-serve-${target.name}-${port}-${process.pid}.log`);
	const fd = openSync(logPath, 'w');
	const child = spawn(command, args, { cwd, env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', fd, fd], detached: true });
	closeSync(fd);
	owned.add(child.pid);
	const tail = () => {
		try {
			return readFileSync(logPath, 'utf8').slice(-4000);
		} catch {
			return '';
		}
	};
	let exited = null;
	child.on('exit', (code) => {
		exited = code ?? 'signal';
		owned.delete(child.pid);
	});
	child.on('error', (e) => (exited = String(e)));
	const stop = async () => {
		if (exited !== null) return;
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {}
		for (let i = 0; i < 20 && exited === null; i++) await new Promise((r) => setTimeout(r, 150));
		if (exited === null) {
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {}
		}
	};
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (exited !== null) throw new Error(`serve command exited (${exited}): ${tail().slice(-600)}`);
		if (await reachable(url)) {
			log(`${target.name}: started \`${command} ${args.join(' ')}\` at ${url}`);
			return { stop, spawned: true };
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	await stop();
	throw new Error(`serve command did not answer at ${url} within ${timeoutMs} ms: ${tail().slice(-600)}`);
}
