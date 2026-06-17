import type {
	BuildEnvironment,
	Environment,
	EnvironmentOptions,
	Plugin,
	UserConfig,
	ViteBuilder,
	ViteDevServer,
} from 'vite';
import type { OutputOptions } from 'rolldown';
import { joinURL } from 'ufo';
import { outputDefaults } from '../build/chunking.ts';
import { createArcadeRolldownPlugin } from '../rolldown.ts';
import {
	type GlobalInjections,
	type ArcadeEnvironment,
	type ArcadeManifest,
	type ArcadeRolldownOptions,
} from '../types.ts';
import { createDevTags } from './dev-tags.ts';
import {
	isServerViteEnvironment,
	arcadeEnvironment,
	transformArcadeRequest,
	viteEnvironmentName,
} from './environment.ts';
import { createViteHmr } from './hmr.ts';

export type {
	GlobalInjections,
	ArcadeEnvironment,
	ArcadeManifest,
	ArcadeRolldownOptions,
} from '../types.ts';

export interface ArcadeViteOptions extends ArcadeRolldownOptions {
	clientEnvironment?: string;
	serverEnvironment?: string;
}

type ArcadeOutputOptions = OutputOptions | OutputOptions[] | undefined;
type InternalArcadeRolldownOptions = ArcadeRolldownOptions & {
	publicPath?: (fileName: string) => string;
};
const ARCADE_SKIP_DUPLICATE_BUILDS = Symbol('arcade-skip-duplicate-builds');

export function arcade(options: ArcadeViteOptions = {}): Plugin[] {
	let manifest: ArcadeManifest | null = null;
	const rolldownOptions: InternalArcadeRolldownOptions = { ...options };
	rolldownOptions.onManifest = (nextManifest) => {
		manifest = nextManifest;
		options.onManifest?.(nextManifest);
	};
	const hmrOptions = {
		base: '/',
		clientEnvironment: viteEnvironmentName('client', options),
		enabled: false,
		invalidateGeneratedModules: (parent: string, environment?: ArcadeEnvironment) =>
			arcadePlugin.api.invalidateGeneratedModules(parent, environment),
	};
	const devTags = createDevTags();
	rolldownOptions.devInjections = devTags.tags;
	const basePlugin = createArcadeRolldownPlugin({
		environment: getBuildEnvironment,
		options: rolldownOptions,
	}) as Plugin & {
		api: { invalidateGeneratedModules: typeof hmrOptions.invalidateGeneratedModules };
	};
	const hmr = createViteHmr(hmrOptions);

	const arcadePlugin = {
		...basePlugin,
		name: 'vite-plugin-arcade',
		enforce: 'post',
		sharedDuringBuild: true,
		api: {
			...basePlugin.api,
			getManifest: () => manifest,
			registerDevInjection: (injection: GlobalInjections) => devTags.register(injection),
		},
		config(config) {
			configDefaults(config);
		},
		configResolved(resolvedConfig) {
			const serve = resolvedConfig.command === 'serve';
			hmrOptions.base = resolvedConfig.base;
			hmrOptions.enabled = serve && options.hmr !== false;
			rolldownOptions.dev = serve;
			rolldownOptions.rootDir = resolvedConfig.root;
			rolldownOptions.publicPath = (fileName) => joinURL(resolvedConfig.base, fileName);
			if (serve) {
				devTags.registerViteTags(resolvedConfig.base, hmrOptions.enabled);
			}
		},
		configEnvironment(name, config) {
			const environment = configEnvironmentKind(name, config, options);
			if (!environment) {
				return undefined;
			}

			const build = config.build ?? {};
			const rolldownOptions = build.rolldownOptions ?? {};
			const outDir = defaultOutDir(environment);
			return {
				build: {
					...build,
					...(environment === 'client'
						? { modulePreload: build.modulePreload ?? false }
						: {}),
					...(build.outDir || !outDir ? {} : { outDir }),
					rolldownOptions: {
						...rolldownOptions,
						output: withOutputDefaults(rolldownOptions.output, environment),
					},
				},
			};
		},
		buildApp: {
			order: 'pre',
			handler(builder) {
				return buildArcadeEnvironments(builder, options);
			},
		},
		configureServer(server: ViteDevServer) {
			rolldownOptions.devServer = {
				transformRequest: (url, environment) =>
					transformArcadeRequest(server, url, environment, options),
			};
			hmr.configureServer(server);
		},
		transformIndexHtml() {
			return hmr.transformIndexHtml();
		},
		resolveId: {
			order: 'pre',
			async handler(source, importer, opts) {
				const hmrResolved = hmr.resolveId(source);
				if (hmrResolved) return hmrResolved;

				return runHook(basePlugin.resolveId, this, source, importer, opts);
			},
		},
		load(id, loadOptions) {
			return hmr.load(id) ?? runHook(basePlugin.load, this, id, loadOptions);
		},
		transform: {
			async handler(code, id, transformOptions) {
				return runHook(basePlugin.transform, this, code, id, transformOptions);
			},
		},
		hotUpdate(ctx) {
			return hmr.hotUpdate(this.environment, ctx);
		},
	} satisfies Plugin & { api: ArcadeVitePluginApi };

	return [arcadePlugin];
}

async function buildArcadeEnvironments(builder: ViteBuilder, options: ArcadeViteOptions) {
	const environments = buildEnvironments(builder, options);
	const names = environments.map((environment) => environment.name);
	skipDuplicateBuilds(builder, names);

	for (const environment of environments) {
		if (!environment.isBuilt) {
			await builder.build(environment);
		}
	}
}

function buildEnvironments(builder: ViteBuilder, options: ArcadeViteOptions) {
	const environments = new Map<string, BuildEnvironment>();
	for (const name of [
		viteEnvironmentName('client', options),
		viteEnvironmentName('server', options),
	]) {
		const environment = builder.environments[name];
		if (environment) {
			environments.set(name, environment);
		}
	}

	for (const environment of Object.values(builder.environments)) {
		if (arcadeEnvironment(environment) === 'server') {
			environments.set(environment.name, environment);
		}
	}

	return [...environments.values()];
}

function skipDuplicateBuilds(builder: ViteBuilder, names: readonly string[]) {
	const guarded = builder as ViteBuilder & {
		[ARCADE_SKIP_DUPLICATE_BUILDS]?: Set<string>;
	};

	const guardedNames = guarded[ARCADE_SKIP_DUPLICATE_BUILDS] ?? new Set<string>();
	for (const name of names) {
		guardedNames.add(name);
	}

	if (guarded[ARCADE_SKIP_DUPLICATE_BUILDS]) return;

	guarded[ARCADE_SKIP_DUPLICATE_BUILDS] = guardedNames;
	const build = builder.build.bind(builder);
	builder.build = (environment: BuildEnvironment) => {
		if (guardedNames.has(environment.name) && environment.isBuilt) {
			return Promise.resolve([]);
		}
		return build(environment);
	};
}

function configDefaults(config: UserConfig) {
	if (config.build?.lib || config.build?.ssr) {
		return;
	}

	const build = (config.build ??= {});
	build.modulePreload ??= false;
}

function withOutputDefaults(
	output: ArcadeOutputOptions,
	environment: ArcadeEnvironment,
): OutputOptions | OutputOptions[] {
	if (Array.isArray(output)) {
		return output.map((item) => outputDefaults(item, environment));
	}

	if (!output) {
		return outputDefaults({}, environment);
	}

	return outputDefaults(output, environment);
}

function defaultOutDir(environment: ArcadeEnvironment) {
	if (environment === 'server') {
		return 'dist/server';
	}

	return undefined;
}

function configEnvironmentKind(
	name: string,
	config: EnvironmentOptions,
	options: ArcadeViteOptions,
): ArcadeEnvironment | null {
	if (config.build?.lib) {
		return null;
	}

	if (name === viteEnvironmentName('client', options)) {
		return 'client';
	}

	if (name === viteEnvironmentName('server', options)) {
		return 'server';
	}

	if (isServerViteEnvironment({ name, config })) {
		return 'server';
	}

	return null;
}

function runHook(hook: unknown, context: unknown, ...args: unknown[]) {
	if (typeof hook !== 'function') {
		return null;
	}
	return hook.call(context, ...args);
}

type ArcadeVitePluginApi = {
	invalidateGeneratedModules: (parent: string, environment?: ArcadeEnvironment) => string[];
	getManifest?: () => ArcadeManifest | null;
	registerDevInjection?: (injection: GlobalInjections) => void;
};

function getBuildEnvironment(context: unknown): ArcadeEnvironment {
	const pluginContext = context as { environment?: Environment };
	return arcadeEnvironment(pluginContext.environment);
}

export type ArcadeVitePlugin = ReturnType<typeof arcade>[number];
