import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'pathe';

export const FIXTURE_DEV_READY = 'markless fixture dev server at';

export type FixtureDevServer = {
	readonly origin: string;
	close(): Promise<void>;
};

// Nitro's dev server reads port 0 as unset and takes its default, so the child is handed a port the OS just gave out.
const freePort = () =>
	new Promise<number>((done, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => done(port));
		});
	});

/** Starts a Vite dev server for a router fixture in a child process and resolves once it says where it listens. */
export async function startFixtureDev(root: string): Promise<FixtureDevServer> {
	const port = await freePort();
	const proc = spawn(
		process.execPath,
		[resolve(import.meta.dirname, 'fixture-dev-child.ts'), root, String(port)],
		{ stdio: ['pipe', 'pipe', 'pipe'] },
	);
	const exited = new Promise<void>((done) => proc.once('exit', () => done()));
	let output = '';
	return new Promise((done, fail) => {
		const read = (chunk: Buffer) => {
			output += chunk;
			const line = output.split('\n').find((text) => text.startsWith(FIXTURE_DEV_READY));
			if (!line) return;
			proc.stdout.off('data', read);
			done({
				origin: line.slice(FIXTURE_DEV_READY.length + 1).trim(),
				close: async () => {
					proc.stdin.end();
					await exited;
				},
			});
		};
		proc.stdout.on('data', read);
		proc.stderr.on('data', (chunk: Buffer) => (output += chunk));
		proc.once('error', fail);
		proc.once('exit', (code, signal) =>
			fail(new Error(`fixture dev server for ${root} exited (${code ?? signal}):\n${output}`)),
		);
	});
}
