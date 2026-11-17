/** Writes the expression that loads a module emitted code names. */
export type ModuleLoad = (specifier: string) => string;

/** Writes the load of an event handler, the first code an interaction runs, given the runtime modules its actions demand. */
export type HandlerLoad = (specifier: string, runtimeModuleIds: ReadonlyArray<string>) => string;

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
function residentModuleLoads(helper: string): ModuleLoads {
	const named = new Set<string>();
	let handlers = false;
	const entry = (specifier: string) => {
		const id = runtimeModuleId(specifier);
		return `[${JSON.stringify(specifier)}, () => ${importCall(specifier)}${id ? `, ${JSON.stringify(id)}` : ''}]`;
	};
	return {
		load(specifier) {
			named.add(specifier);
			return `marklessDevLoad(import.meta.url, ${JSON.stringify(specifier)}, () => ${importCall(specifier)})`;
		},
		handler(specifier, runtimeModuleIds) {
			handlers = true;
			return `marklessDevWarmed(${JSON.stringify([...runtimeModuleIds].sort())}).then(() => ${importCall(specifier)})`;
		},
		imports: () =>
			named.size === 0 && !handlers
				? null
				: [
						`import { marklessDevLoad, marklessDevWarm, marklessDevWarmed } from ${JSON.stringify(helper)};`,
						named.size > 0
							? `marklessDevWarm(import.meta.url, [${[...named].map(entry).join(', ')}]);`
							: '',
					].join('\n'),
	};
}

/** Without a `load`, each emitter writes its own native `import()`, so a build's bytes stay as they are. */
export function moduleLoads(devServer: boolean, helper = DEV_RESIDENT_MODULE): ModuleLoads {
	return devServer ? residentModuleLoads(helper) : nativeLoads;
}
