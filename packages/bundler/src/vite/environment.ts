import { createServerModuleRunner, isRunnableDevEnvironment } from 'vite';
import type { DevEnvironment, Environment, ViteDevServer } from 'vite';
import type { MarklessEnvironment } from '../types.ts';

type ViteEnvironmentConfig = {
	consumer?: string;
	build?: { lib?: unknown };
};

type ViteEnvironmentLike = {
	name?: string;
	config?: ViteEnvironmentConfig;
};

const UNMANAGED_VITE_ENVIRONMENTS = new Set(['nitro']);

export interface MarklessViteEnvironmentOptions {
	clientEnvironment?: string;
	serverEnvironment?: string;
}

export function viteEnvironmentName(
	environment: MarklessEnvironment,
	options: MarklessViteEnvironmentOptions = {},
) {
	if (environment === 'client') {
		return options.clientEnvironment ?? 'client';
	}
	if (environment === 'server') {
		return options.serverEnvironment ?? 'ssr';
	}
	return environment;
}

export function marklessEnvironment(environment: ViteEnvironmentLike | undefined) {
	const config = environment?.config;
	if (isUnmanagedViteEnvironment(environment)) {
		return 'lib';
	}

	if (!config) {
		return 'client';
	}

	if (config.build?.lib) {
		return 'lib';
	}

	if (isServerViteEnvironment(environment)) {
		return 'server';
	}

	return 'client';
}

export function isServerViteEnvironment(environment: ViteEnvironmentLike | undefined) {
	if (isUnmanagedViteEnvironment(environment)) {
		return false;
	}

	const consumer = environment?.config?.consumer;
	if (consumer) {
		return consumer === 'server';
	}

	return environment?.name !== undefined && environment.name !== 'client';
}

function isUnmanagedViteEnvironment(environment: ViteEnvironmentLike | undefined) {
	return !!environment?.name && UNMANAGED_VITE_ENVIRONMENTS.has(environment.name);
}

export function transformMarklessRequest(
	server: Pick<ViteDevServer, 'environments'>,
	url: string,
	environment: MarklessEnvironment,
	options?: MarklessViteEnvironmentOptions,
) {
	return server.environments[viteEnvironmentName(environment, options)]?.transformRequest(url);
}

const serverModuleRunners = new WeakMap<
	object,
	Map<string, ReturnType<typeof createServerModuleRunner>>
>();

// One runner per server environment. A source-shipped dependency is executed
// through it because Node cannot import raw TypeScript out of node_modules.
export function serverModuleRunner(server: ViteDevServer, environmentName: string) {
	const environment = server.environments[environmentName] as DevEnvironment | undefined;
	if (!environment || !isRunnableDevEnvironment(environment)) {
		throw new Error(`MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE: ${environmentName}`);
	}
	const byName = serverModuleRunners.get(server) ?? new Map();
	serverModuleRunners.set(server, byName);
	const existing = byName.get(environmentName);
	if (existing) return existing;
	const runner = createServerModuleRunner(environment);
	byName.set(environmentName, runner);
	server.httpServer?.once('close', () => void runner.close());
	return runner;
}

// True when this process owns the environment's module runner, so a hot payload we
// send reaches it. Nitro runs its runner in a separate worker instead.
export function hasInProcessModuleRunner(environment: Environment | undefined) {
	return !!environment && isRunnableDevEnvironment(environment);
}

export function fetchableDevEnvironment(environment: Environment | undefined) {
	if (!environment) {
		return undefined;
	}

	const maybeFetchable = environment as Environment & {
		dispatchFetch?: (request: Request) => Promise<Response> | Response;
	};
	if (typeof maybeFetchable.dispatchFetch === 'function') {
		// The typeof guard proved the method exists; the cast carries that into the return type.
		return maybeFetchable as Environment & {
			dispatchFetch: (request: Request) => Promise<Response> | Response;
		};
	}

	return undefined;
}
