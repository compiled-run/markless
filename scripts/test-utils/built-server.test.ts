import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startBuiltServer } from './built-server.ts';

let dir = '';
const strays = new Set<number>();

// Like a built Nitro server: it traps uncaught errors by logging them, which spins forever once its stderr pipe is gone.
const serverSource = (extra: string) => `
import { createServer } from 'node:http';
process.on('uncaughtException', (error) => console.error('[uncaughtException]', error));
${extra}
const server = createServer((_request, response) => response.end('ok'));
server.listen(Number(process.env.PORT), '127.0.0.1', () => {
	console.log('Listening on: http://127.0.0.1:' + server.address().port + '/');
});
`;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'markless-built-server-'));
	await writeFile(join(dir, 'quiet.mjs'), serverSource(''));
	await writeFile(
		join(dir, 'noisy.mjs'),
		serverSource("setInterval(() => console.error('still serving'), 20);"),
	);
	await writeFile(join(dir, 'stubborn.mjs'), serverSource("process.on('SIGTERM', () => {});"));
	await writeFile(
		join(dir, 'parent.ts'),
		[
			`import { startBuiltServer } from ${JSON.stringify(join(import.meta.dirname, 'built-server.ts'))};`,
			'const server = await startBuiltServer(process.argv[2]);',
			"await fetch(server.origin + '/');",
			'console.log(server.pid);',
		].join('\n'),
	);
});

afterAll(async () => {
	for (const pid of strays) if (alive(pid)) process.kill(pid, 'SIGKILL');
	if (dir) await rm(dir, { recursive: true, force: true });
});

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function goneWithin(pid: number, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (!alive(pid)) return true;
		await new Promise((done) => setTimeout(done, 25));
	}
	return !alive(pid);
}

function startInParent(entry: string): Promise<{ parent: number; server: number }> {
	const parent = spawn(process.execPath, [join(dir, 'parent.ts'), join(dir, entry)], {
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	return new Promise((done, fail) => {
		let output = '';
		parent.stdout.on('data', (chunk: Buffer) => {
			output += chunk.toString();
			const pid = /^(\d+)\n/.exec(output);
			if (!pid) return;
			strays.add(Number(pid[1]));
			done({ parent: parent.pid!, server: Number(pid[1]) });
		});
		parent.once('exit', (code) => fail(new Error(`parent exited (${code}): ${output}`)));
	});
}

for (const entry of ['quiet.mjs', 'noisy.mjs'])
	test(`a server started for a test exits when the test process is killed outright (${entry})`, async () => {
		const { parent, server } = await startInParent(entry);
		expect(alive(server)).toBe(true);
		process.kill(parent, 'SIGKILL');
		expect(await goneWithin(server, 3_000)).toBe(true);
	});

test('closing a server that ignores SIGTERM still ends its process', async () => {
	const server = await startBuiltServer(join(dir, 'stubborn.mjs'));
	strays.add(server.pid);
	await server.close();
	expect(alive(server.pid)).toBe(false);
});
