import type { Environment, ViteDevServer } from 'vite';
import type { ArcadeEnvironment } from '../types.ts';

type ViteEnvironmentConfig = {
	consumer?: string;
	build?: { lib?: unknown };
};

type ViteEnvironmentLike = {
	name?: string;
	config?: ViteEnvironmentConfig;
};

export interface ArcadeViteEnvironmentOptions {
	clientEnvironment?: string;
	serverEnvironment?: string;
}

export function viteEnvironmentName(
	environment: ArcadeEnvironment,
	options: ArcadeViteEnvironmentOptions = {},
) {
	if (environment === 'client') {
		return options.clientEnvironment ?? 'client';
	}
	if (environment === 'server') {
		return options.serverEnvironment ?? 'ssr';
	}
	return environment;
}

export function arcadeEnvironment(environment: ViteEnvironmentLike | undefined) {
	const config = environment?.config;
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
	const consumer = environment?.config?.consumer;
	if (consumer) {
		return consumer === 'server';
	}

	return environment?.name !== undefined && environment.name !== 'client';
}

export function transformArcadeRequest(
	server: Pick<ViteDevServer, 'environments'>,
	url: string,
	environment: ArcadeEnvironment,
	options?: ArcadeViteEnvironmentOptions,
) {
	return server.environments[viteEnvironmentName(environment, options)]?.transformRequest(url);
}

export function fetchableDevEnvironment(environment: Environment | undefined) {
	if (!environment) {
		return undefined;
	}

	const maybeFetchable = environment as {
		dispatchFetch?: (request: Request) => Promise<Response> | Response;
	};
	if (typeof maybeFetchable.dispatchFetch === 'function') {
		return maybeFetchable;
	}

	return undefined;
}
