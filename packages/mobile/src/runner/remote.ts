// An emulator on another machine, driven through its agent (pc-agent.ts) over an ssh host alias from this machine's ssh config.
import { execFileSync, spawn } from 'node:child_process';
import { basename } from 'node:path';
import type { PhoneSpec } from './pool.ts';

/** The agent's "not now" (paused for games, or still preparing this runner's commit): EX_TEMPFAIL. */
export const AGENT_NOT_NOW = 75;
const SSH_FAILED = 255;

type RemoteSpec = Extract<PhoneSpec, { platform: 'android' }> & {
	readonly remote: string;
};

/** The machine is unreachable or says not now: the chunk goes back to the queue and this machine's own phones take it. */
export class RemoteAway extends Error {}

/** The agent runs run-chunk.ts from its own checkout of this commit. */
export const runnerCommit = (): string =>
	execFileSync('git', ['-C', import.meta.dirname, 'rev-parse', 'HEAD'], {
		encoding: 'utf8',
	}).trim();

type Call = {
	readonly input?: NodeJS.ReadableStream | string;
	readonly stdout?: NodeJS.WritableStream;
	readonly stderr?: number | NodeJS.WritableStream;
	readonly timeoutMs?: number;
};

/** One agent command over ssh; throws RemoteAway when the machine is unreachable or says not now. */
export async function callAgent(
	spec: RemoteSpec,
	args: ReadonlyArray<string>,
	call: Call = {},
): Promise<string> {
	const child = spawn(
		'ssh',
		[
			'-o',
			'BatchMode=yes',
			'-o',
			'ConnectTimeout=10',
			'-o',
			'ServerAliveInterval=15',
			'-o',
			'ServerAliveCountMax=4',
			spec.remote,
			runnerCommit(),
			...args,
		],
		{
			stdio: ['pipe', 'pipe', typeof call.stderr === 'number' ? call.stderr : 'pipe'],
		},
	);
	let out = '';
	let err = '';
	const stdin = child.stdin!;
	const stdout = child.stdout!;
	if (call.stdout) stdout.pipe(call.stdout);
	else stdout.on('data', (data: Buffer) => (out += data.toString()));
	if (child.stderr) {
		if (call.stderr && typeof call.stderr !== 'number') child.stderr.pipe(call.stderr);
		else child.stderr.on('data', (data: Buffer) => (err += data.toString()));
	}
	if (typeof call.input === 'string') stdin.end(call.input);
	else if (call.input) call.input.pipe(stdin);
	else stdin.end();
	const timer = call.timeoutMs
		? setTimeout(() => child.kill('SIGTERM'), call.timeoutMs)
		: undefined;
	const code = await new Promise<number | null>((resolve) =>
		child.on('close', (exitCode) => resolve(exitCode)),
	);
	if (timer) clearTimeout(timer);
	const said = (out + err).trim().split('\n').slice(-3).join(' ');
	if (code === AGENT_NOT_NOW) throw new RemoteAway(`${spec.remote} says not now: ${said}`);
	if (code === null)
		throw new Error(`${spec.remote} ${args[0]} did not finish in ${call.timeoutMs} ms`);
	if (code === SSH_FAILED)
		throw new RemoteAway(`${spec.remote} does not answer${said ? `: ${said}` : ''}`);
	if (code !== 0) throw new Error(`${spec.remote} ${args[0]} failed (${code}): ${said}`);
	return out;
}

export async function remoteBoot(spec: RemoteSpec, fresh: boolean): Promise<string> {
	await callAgent(spec, ['boot', spec.avd, String(spec.port), fresh ? 'fresh' : 'reuse'], {
		timeoutMs: 600_000,
	});
	return `emulator-${spec.port}`;
}

export async function remoteAnswers(spec: RemoteSpec): Promise<boolean> {
	try {
		return (
			(
				await callAgent(spec, ['answers', String(spec.port)], {
					timeoutMs: 60_000,
				})
			).trim() === 'yes'
		);
	} catch {
		return false;
	}
}

export async function remoteStop(spec: RemoteSpec): Promise<void> {
	await callAgent(spec, ['stop', String(spec.port)], {
		timeoutMs: 120_000,
	}).catch(() => undefined);
}

/** Runs `tar` and returns a promise for its exit; the archive streams through its stdin or stdout. */
function tar(args: ReadonlyArray<string>, stdio: 'in' | 'out') {
	const child = spawn('tar', args, {
		stdio: stdio === 'in' ? ['pipe', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, COPYFILE_DISABLE: '1' },
	});
	let err = '';
	child.stderr!.on('data', (data: Buffer) => (err += data.toString()));
	const done = new Promise<void>((resolve, reject) =>
		child.on('close', (code) =>
			code === 0
				? resolve()
				: reject(new Error(`tar ${args[0]} failed (${code}): ${err.trim()}`)),
		),
	);
	return { child, done };
}

/** One upload per job and machine, shared by that job's chunks on the machine's other phones. */
const sent = new Map<string, Promise<void>>();

/** Sends the job's bundle once, then the chunk; the agent's result file and screenshots land in the job folder as a local chunk writes them. */
export async function runRemoteChunk(
	spec: RemoteSpec,
	job: string,
	name: string,
	chunkJson: string,
	driver: 'keep-driver' | 'reinstall-driver',
	log: number,
): Promise<void> {
	const id = basename(job);
	const key = `${spec.remote}/${id}`;
	let upload = sent.get(key);
	if (!upload) {
		const pack = tar(['-c', '-f', '-', '-C', job, 'job.json', 'bundle'], 'out');
		upload = Promise.all([
			callAgent(spec, ['put', id], {
				input: pack.child.stdout!,
				stderr: log,
				timeoutMs: 600_000,
			}),
			pack.done,
		]).then(() => undefined);
		sent.set(key, upload);
		upload.catch(() => sent.delete(key));
	}
	await upload;
	const unpack = tar(['-x', '-f', '-', '-C', job], 'in');
	await Promise.all([
		callAgent(spec, ['run', id, name, String(spec.port), driver], {
			input: chunkJson,
			stdout: unpack.child.stdin!,
			stderr: log,
			timeoutMs: 3_600_000,
		}),
		unpack.done,
	]);
}
