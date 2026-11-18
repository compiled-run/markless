// Rolldown keeps a build's native memory until its process exits, so the client graph is built in a child process
// and the server environments start in this one without it.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { InlineConfig, ResolvedConfig, ViteBuilder } from 'vite';
import { buildWorkerJobsInFlight } from '../build-workers.ts';
import type { ClientBuildHandoff } from '../types.ts';

export const SEPARATE_CLIENT_BUILD_ENV = 'MARKLESS_CLIENT_BUILD_PROCESS';
export const MARKLESS_VITE_PLUGIN_NAME = 'vite-plugin-markless';

export type ClientBuildRequest = {
	readonly vite: string;
	/** The inline config as JSON, regular expressions tagged so the child can rebuild them. */
	readonly inlineConfig: string;
	readonly configFingerprint: string;
	readonly handoffFile: string;
};

const REGEXP_TAG = '__marklessRegExp';

// The child exits with this when the config it resolved differs from this process's, and the client builds here.
export const CLIENT_CONFIG_MISMATCH_EXIT = 86;

/** The child's request when the client build can run in its own process, else `undefined`. */
export function clientBuildRequest(
	builder: ViteBuilder,
	clientEnvironment: string,
): Omit<ClientBuildRequest, 'handoffFile'> | undefined {
	if (process.env[SEPARATE_CLIENT_BUILD_ENV] === '0' || childExecArgv() === undefined)
		return undefined;
	const environments = Object.keys(builder.environments);
	if (!environments.includes(clientEnvironment) || environments.length < 2) return undefined;
	if (builder.environments[clientEnvironment]?.isBuilt) return undefined;
	const { config } = builder;
	// Plugins passed in code cannot cross a process boundary; only a config file's plugins can be loaded again.
	if (typeof config?.configFile !== 'string') return undefined;
	// A watching build keeps rebuilding the client, so its graph has to stay in this process.
	if (config.build?.watch || Object.values(config.environments ?? {}).some((e) => e.build?.watch))
		return undefined;
	const inline = config.inlineConfig ?? {};
	if ('plugins' in inline) return undefined;
	const vite = viteEntry(config.root);
	const inlineConfig = inlineConfigText(inline);
	return vite && inlineConfig !== undefined
		? { vite, inlineConfig, configFingerprint: configFingerprint(config) }
		: undefined;
}

export function parseInlineConfig(text: string): InlineConfig {
	return JSON.parse(text, (_key, value: unknown) =>
		value && typeof value === 'object' && REGEXP_TAG in value
			? new RegExp(...(value as Record<string, [string, string]>)[REGEXP_TAG]!)
			: value,
	) as InlineConfig;
}

// Functions and class instances cannot be sent to another process, so such a config builds in this one.
function inlineConfigText(inline: InlineConfig): string | undefined {
	let sendable = true;
	const text = JSON.stringify(inline, (_key, value: unknown) => {
		if (value instanceof RegExp) return { [REGEXP_TAG]: [value.source, value.flags] };
		if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
			sendable = false;
		else if (value && typeof value === 'object' && !Array.isArray(value)) {
			const prototype = Object.getPrototypeOf(value);
			if (prototype !== Object.prototype && prototype !== null) sendable = false;
		}
		return value;
	});
	return sendable ? text : undefined;
}

// Per process, or holding what the child loads again for itself.
const UNCOMPARED_CONFIG_KEYS = new Set([
	'inlineConfig',
	'plugins',
	'logger',
	'webSocketToken',
	'additionalAllowedHosts',
]);

/** The resolved config as text, functions by presence only; equal text means the child resolved the same build. */
export function configFingerprint(config: ResolvedConfig): string {
	const seen = new WeakSet<object>();
	return JSON.stringify(
		{
			...Object.fromEntries(
				Object.entries(config).filter(([key]) => !UNCOMPARED_CONFIG_KEYS.has(key)),
			),
			plugins: config.plugins.map((plugin) => plugin.name),
		},
		(_key, value: unknown) => {
			if (typeof value === 'function') return 'function';
			if (typeof value === 'bigint' || typeof value === 'symbol') return String(value);
			if (value instanceof RegExp) return String(value);
			if (value && typeof value === 'object') {
				if (seen.has(value)) return 'seen';
				seen.add(value);
			}
			return value;
		},
	);
}

// Flags that run code of their own or hold a port would make the child something other than the client build.
function childExecArgv(): string[] | undefined {
	const args: string[] = [];
	const argv = process.execArgv;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		if (/^(-e|-p|--eval|--print)(=|$)/.test(arg)) return undefined;
		if (/^--(inspect|debug|watch|test)/.test(arg)) continue;
		args.push(arg);
	}
	return args;
}

/** The client build's handoff, or `undefined` when the child resolved a different config and built nothing. */
export async function buildClientInChildProcess(
	request: Omit<ClientBuildRequest, 'handoffFile'>,
): Promise<ClientBuildHandoff | undefined> {
	const directory = mkdtempSync(join(tmpdir(), 'markless-client-build-'));
	try {
		const handoffFile = join(directory, 'handoff.json');
		const requestFile = join(directory, 'request.json');
		writeFileSync(requestFile, JSON.stringify({ ...request, handoffFile }));
		const child = spawn(
			process.execPath,
			[...(childExecArgv() ?? []), clientBuildProcessFile(), requestFile],
			{ stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: process.env },
		);
		const exit = await waitForClientBuildProcess(child);
		if (exit === `exit code ${CLIENT_CONFIG_MISMATCH_EXIT}`) return undefined;
		if (exit)
			throw new Error(
				`MARKLESS_CLIENT_BUILD_FAILED: the client build failed in its own process (${exit}); its error is printed above. Set ${SEPARATE_CLIENT_BUILD_ENV}=0 to build every environment in one process.`,
			);
		return JSON.parse(readFileSync(handoffFile, 'utf8')) as ClientBuildHandoff;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

type ClientBuildProgress = {
	readonly kind: 'progress';
	readonly cpuMicros: number;
	readonly workerJobs: number;
	/** Requests, sockets and processes holding the child's event loop open, such as a plugin's fetch. */
	readonly pendingIo: readonly string[];
	readonly intervalMs: number;
};

const PROGRESS_INTERVAL_MS = 5_000;
// Twelve reports, about a minute, in which the child spent no CPU, handed no build worker a job and waited on no I/O.
const STALLED_REPORTS = 12;
// A report itself costs microseconds; a build doing anything spends far more than this share of one core.
const IDLE_CPU_SHARE = 0.01;
// Held open without anything to wait for: timers, stdio, and file watchers a plugin left running.
const IDLE_RESOURCES = new Set([
	'Timeout',
	'Immediate',
	'TTYWrap',
	'PipeWrap',
	'SignalWrap',
	'FSEventWrap',
	'StatWatcher',
]);

/** In the child: reports the CPU it has used and the worker jobs it waits on, without holding the process open. */
export function reportClientBuildProgress(intervalMs = PROGRESS_INTERVAL_MS): void {
	if (!process.send) return;
	process.channel?.unref();
	setInterval(() => {
		const { user, system } = process.cpuUsage();
		const progress: ClientBuildProgress = {
			kind: 'progress',
			cpuMicros: user + system,
			workerJobs: buildWorkerJobsInFlight(),
			pendingIo: process.getActiveResourcesInfo().filter((type) => !IDLE_RESOURCES.has(type)),
			intervalMs,
		};
		process.send?.(progress, undefined, undefined, () => {});
	}, intervalMs).unref();
}

/**
 * The child's exit, `null` when it succeeded. A child that reports no CPU spent, no worker job and no I/O pending for
 * `stalledReports` reports in a row waits on something that will never settle, so it is stopped and the build fails.
 */
export function waitForClientBuildProcess(
	child: ChildProcess,
	stalledReports = STALLED_REPORTS,
): Promise<string | null> {
	return new Promise((resolve, reject) => {
		let previousCpu: number | undefined;
		let idleReports = 0;
		let lastWork = '';
		child.on('message', (message: ClientBuildProgress) => {
			if (message?.kind !== 'progress') return;
			const used =
				previousCpu === undefined
					? Number.POSITIVE_INFINITY
					: message.cpuMicros - previousCpu;
			previousCpu = message.cpuMicros;
			if (
				message.workerJobs > 0 ||
				message.pendingIo.length > 0 ||
				used >= message.intervalMs * 1000 * IDLE_CPU_SHARE
			) {
				idleReports = 0;
				lastWork = `${Math.round(message.cpuMicros / 1e6)} s of CPU in`;
				return;
			}
			if (++idleReports < stalledReports) return;
			child.kill('SIGKILL');
			const idleSeconds = Math.round((idleReports * message.intervalMs) / 1000);
			reject(
				new Error(
					`MARKLESS_CLIENT_BUILD_STALLED: the client build process stopped making progress. For ${idleSeconds} s it used no CPU, had no compile or chunk job on a build worker and waited on no request, socket or process${lastWork ? ` (${lastWork})` : ''}, so the build is waiting on something that will never settle. It was stopped; its output so far is printed above.`,
				),
			);
		});
		child.once('error', reject);
		child.once('exit', (code, signal) =>
			resolve(code === 0 ? null : signal ? `signal ${signal}` : `exit code ${code}`),
		);
	});
}

function clientBuildProcessFile(): string {
	return fileURLToPath(
		new URL(
			import.meta.url.endsWith('.ts')
				? './client-build-process.ts'
				: './client-build-process.js',
			import.meta.url,
		),
	);
}

// The Vite the app resolves, which its build command runs; else the one this plugin was installed with.
function viteEntry(root: string): string | undefined {
	try {
		return pathToFileURL(createRequire(join(root, 'package.json')).resolve('vite')).href;
	} catch {
		try {
			return import.meta.resolve('vite');
		} catch {
			return undefined;
		}
	}
}
