import { spawn } from 'node:child_process';

export type BuiltServer = {
	/** `http://host:port` the server reported it is listening on. */
	readonly origin: string;
	/** Everything the server wrote to stdout and stderr so far. */
	output(): string;
	close(signal?: NodeJS.Signals): void;
};

/**
 * Starts a built Nitro server on a port the OS picks and resolves once the server says it is
 * listening; a server that exits first rejects with its output instead of waiting out a clock.
 */
export function startBuiltServer(
	entry: string,
	options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<BuiltServer> {
	// srvx prints its listening line only while `TEST` is unset, and a test runner sets it.
	const { TEST: _test, ...env } = options.env ?? process.env;
	const child = spawn(process.execPath, [entry], {
		cwd: options.cwd,
		env: { ...env, PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	const close = (signal?: NodeJS.Signals) => void child.kill(signal);
	return new Promise((resolveServer, reject) => {
		const fail = (error: Error) => {
			close('SIGKILL');
			reject(error);
		};
		child.stdout.on('data', (chunk: Buffer) => {
			output += chunk.toString();
			const listening = /Listening on:\s*(\S+)/.exec(output);
			if (listening)
				resolveServer({ origin: new URL(listening[1]!).origin, output: () => output, close });
		});
		child.stderr.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.once('error', fail);
		child.once('exit', (code, signal) =>
			fail(new Error(`built server exited (${code ?? signal}) before listening:\n${output}`)),
		);
	});
}
