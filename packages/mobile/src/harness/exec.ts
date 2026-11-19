import { spawn } from 'node:child_process';

export type ExecResult = {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
};

export type ExecOptions = {
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly timeoutMs?: number;
	/** Resolve with a non-zero code instead of throwing. */
	readonly allowFailure?: boolean;
};

export function exec(
	command: string,
	args: ReadonlyArray<string>,
	options: ExecOptions = {},
): Promise<ExecResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		const timer = options.timeoutMs
			? setTimeout(() => {
					child.kill('SIGKILL');
					reject(
						new Error(
							`${command} ${args.join(' ')} timed out after ${options.timeoutMs} ms`,
						),
					);
				}, options.timeoutMs)
			: undefined;
		child.on('error', (error) => {
			clearTimeout(timer);
			reject(new Error(`could not start ${command}: ${error.message}`));
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			const result = { code: code ?? 1, stdout, stderr };
			if (result.code !== 0 && !options.allowFailure) {
				reject(
					new Error(
						`${command} ${args.join(' ')} exited ${result.code}\n${stderr || stdout}`.trimEnd(),
					),
				);
			} else resolve(result);
		});
	});
}
