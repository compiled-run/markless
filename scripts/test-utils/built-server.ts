import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const exitWithParent = fileURLToPath(new URL('./exit-with-parent.mjs', import.meta.url));
const CLOSE_GRACE_MS = 2_000;
const live = new Set<ChildProcess>();
let killOnExit = false;

export type BuiltServer = {
	/** `http://host:port` the server reported it is listening on. */
	readonly origin: string;
	/** The server's process id. */
	readonly pid: number;
	/** Everything the server wrote to stdout and stderr so far. */
	output(): string;
	/** Resolves with the output once it contains `text`; a pipe can deliver a log line after the response it belongs to. */
	waitForOutput(text: string): Promise<string>;
	/** Stops the server and resolves once its process has exited; a server still running after a short grace is killed. */
	close(signal?: NodeJS.Signals): Promise<void>;
};

/**
 * Starts a built Nitro server on `port`, or on a port the OS picks, and resolves once the server says it is
 * listening; a server that exits first rejects with its output instead of waiting out a clock.
 * The server exits when this process does, however this process ends.
 */
export function startBuiltServer(
	entry: string,
	options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly port?: number } = {},
): Promise<BuiltServer> {
	// srvx prints its listening line only while `TEST` is unset, and a test runner sets it.
	const { TEST: _test, ...env } = options.env ?? process.env;
	const child = spawn(process.execPath, ['--import', exitWithParent, entry], {
		cwd: options.cwd,
		env: { ...env, PORT: String(options.port ?? 0) },
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	live.add(child);
	if (!killOnExit) {
		killOnExit = true;
		process.once('exit', () => {
			for (const server of live) server.kill('SIGKILL');
		});
	}
	let output = '';
	const waiters = new Set<{ text: string; done: (output: string) => void }>();
	const append = (chunk: Buffer) => {
		output += chunk.toString();
		for (const waiter of waiters)
			if (output.includes(waiter.text)) {
				waiters.delete(waiter);
				waiter.done(output);
			}
	};
	const waitForOutput = (text: string) =>
		output.includes(text)
			? Promise.resolve(output)
			: new Promise<string>((done) => waiters.add({ text, done }));
	const exited = new Promise<void>((done) =>
		child.once('exit', () => {
			live.delete(child);
			done();
		}),
	);
	const close = (signal?: NodeJS.Signals) => {
		if (child.exitCode !== null || child.signalCode !== null) return exited;
		child.kill(signal);
		const escalate = setTimeout(() => child.kill('SIGKILL'), CLOSE_GRACE_MS);
		return exited.finally(() => clearTimeout(escalate));
	};
	return new Promise((resolveServer, reject) => {
		const fail = (error: Error) => {
			void close('SIGKILL');
			reject(error);
		};
		child.stdout.on('data', (chunk: Buffer) => {
			append(chunk);
			const listening = /Listening on:\s*(\S+)/.exec(output);
			if (listening)
				resolveServer({
					origin: new URL(listening[1]!).origin,
					pid: child.pid!,
					output: () => output,
					waitForOutput,
					close,
				});
		});
		child.stderr.on('data', append);
		child.once('error', fail);
		child.once('exit', (code, signal) =>
			fail(new Error(`built server exited (${code ?? signal}) before listening:\n${output}`)),
		);
	});
}
