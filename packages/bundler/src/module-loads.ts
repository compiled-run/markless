/** What the analysis knows of a module emitted code names: the symbol of this file it holds, or the compiled file it is. */
export type LoadedModule = { readonly symbolId?: string; readonly file?: string };

/** Writes the expression that loads a module emitted code names. */
export type ModuleLoad = (specifier: string, module?: LoadedModule) => string;

/** What a handler load serves, from the demand map: its actions' first uses, and children whose bound symbols it loads. */
export type HandlerReach = {
	readonly runtimeModuleIds: ReadonlyArray<string>;
	// Absent when the map cannot bound one of the actions.
	readonly actions?: ReadonlyArray<unknown>;
	readonly children?: ReadonlyArray<string>;
};

/** Writes the load of an event handler, the first code an interaction runs. */
export type HandlerLoad = (specifier: string, reach: HandlerReach) => string;

export type ModuleLoads = {
	readonly load?: ModuleLoad;
	readonly handler?: HandlerLoad;
	imports(): string | null;
};

export const DEV_RESIDENT_MODULE = '@markless/web/fns/dev-resident';

const RUNTIME_FUNCTIONS = '@markless/web/fns/';

const nativeLoads: ModuleLoads = { imports: () => null };

const importCall = (specifier: string) => `import(${JSON.stringify(specifier)})`;

// The demand map's id for a runtime function module the emitted code names, the id its records list.
function runtimeModuleId(specifier: string): string | undefined {
	return specifier.startsWith(RUNTIME_FUNCTIONS)
		? `web/fns/${specifier.slice(RUNTIME_FUNCTIONS.length)}`
		: undefined;
}

// A dev `import()` fetches on first use, a task after the write that reached it; a build has packed code on the page.
function residentModuleLoads(file: string, helper: string, demand: unknown): ModuleLoads {
	const named = new Map<string, LoadedModule>();
	let handlers = false;
	const entry = ([specifier, module]: [string, LoadedModule]) => {
		const facts = { runtimeModuleId: runtimeModuleId(specifier), ...module };
		return `[${JSON.stringify(specifier)}, () => ${importCall(specifier)}, ${JSON.stringify(facts)}]`;
	};
	return {
		load(specifier, module) {
			named.set(specifier, { ...named.get(specifier), ...module });
			return `marklessDevLoad(import.meta.url, ${JSON.stringify(specifier)}, () => ${importCall(specifier)})`;
		},
		handler(specifier, reach) {
			handlers = true;
			// The handler's own module is asked for first, so its fetch never waits behind the code its writes reach.
			return `Promise.all([${importCall(specifier)}, marklessDevWarmed(${JSON.stringify({ file, ...reach, runtimeModuleIds: [...reach.runtimeModuleIds].sort() })})]).then(([mod]) => mod)`;
		},
		imports: () =>
			named.size === 0 && !handlers && demand === undefined
				? null
				: [
						`import { marklessDevDemand, marklessDevLoad, marklessDevWarm, marklessDevWarmed } from ${JSON.stringify(helper)};`,
						demand === undefined
							? ''
							: `marklessDevDemand(${JSON.stringify(file)}, ${JSON.stringify(demand)});`,
						named.size > 0
							? `marklessDevWarm(import.meta.url, ${JSON.stringify(file)}, [${[...named].map(entry).join(', ')}]);`
							: '',
					].join('\n'),
	};
}

/**
 * On the dev server, `file` is the compiled file emitting the code and `demand` what its demand map publishes to the
 * page join; without a file each emitter writes its own native `import()`, so a build's bytes stay as they are.
 */
export function moduleLoads(
	file: string | undefined,
	demand?: unknown,
	helper = DEV_RESIDENT_MODULE,
): ModuleLoads {
	return file === undefined ? nativeLoads : residentModuleLoads(file, helper, demand);
}
