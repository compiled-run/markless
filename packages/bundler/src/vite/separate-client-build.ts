// Rolldown keeps a build's native memory until its process exits, so the client graph is built in a child process
// and the server environments start in this one without it.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { InlineConfig, ResolvedConfig, ViteBuilder } from 'vite';
import type { ClientBuildHandoff } from '../types.ts';

export const SEPARATE_CLIENT_BUILD_ENV = 'MARKLESS_CLIENT_BUILD_PROCESS';
export const MARKLESS_VITE_PLUGIN_NAME = 'vite-plugin-markless';

export type ClientBuildRequest = {
	readonly vite: string;
	readonly inlineConfig: InlineConfig;
	readonly configFingerprint: string;
	readonly handoffFile: string;
};

// The child exits with this when the config it resolved differs from this process's, and the client builds here.
export const CLIENT_CONFIG_MISMATCH_EXIT = 86;

/** The child's request when the client build can run in its own process, else `undefined`. */
export function clientBuildRequest(
	builder: ViteBuilder,
	clientEnvironment: string,
): Omit<ClientBuildRequest, 'handoffFile'> | undefined {
	if (process.env[SEPARATE_CLIENT_BUILD_ENV] === '0') return undefined;
	const environments = Object.keys(builder.environments);
	if (!environments.includes(clientEnvironment) || environments.length < 2) return undefined;
	if (builder.environments[clientEnvironment]?.isBuilt) return undefined;
	const { config } = builder;
	// Plugins passed in code cannot cross a process boundary; only a config file's plugins can be loaded again.
	if (typeof config?.configFile !== 'string') return undefined;
	const inline = config.inlineConfig ?? {};
	if ('plugins' in inline) return undefined;
	const vite = viteEntry(config.root);
	// Config hooks write into the inline config; the child runs them again on what is left of it.
	const inlineConfig = plainData(inline) as InlineConfig;
	return vite ? { vite, inlineConfig, configFingerprint: configFingerprint(config) } : undefined;
}

/** What the client build reads from a resolved config, as text; equal text means the child resolved the same build. */
export function configFingerprint(config: ResolvedConfig): string {
	const seen = new WeakSet<object>();
	return JSON.stringify(
		{
			root: config.root,
			base: config.base,
			mode: config.mode,
			define: config.define,
			environments: Object.fromEntries(
				Object.entries(config.environments).map(([name, environment]) => [
					name,
					{
						consumer: environment.consumer,
						build: environment.build,
						resolve: environment.resolve,
					},
				]),
			),
		},
		(_key, value: unknown) => {
			if (typeof value === 'function') return 'function';
			if (value instanceof RegExp) return String(value);
			if (value && typeof value === 'object') {
				if (seen.has(value)) return 'seen';
				seen.add(value);
			}
			return value;
		},
	);
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
			[...process.execArgv, clientBuildProcessFile(), requestFile],
			{ stdio: 'inherit', env: process.env },
		);
		const exit = await new Promise<string | null>((resolve, reject) => {
			child.once('error', reject);
			child.once('exit', (code, signal) =>
				resolve(code === 0 ? null : signal ? `signal ${signal}` : `exit code ${code}`),
			);
		});
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

function plainData(value: unknown): unknown {
	if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
	if (Array.isArray(value)) return value.map(plainData).filter((item) => item !== undefined);
	if (typeof value !== 'object') return undefined;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return undefined;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
			const plain = plainData(item);
			return plain === undefined ? [] : [[key, plain]];
		}),
	);
}
