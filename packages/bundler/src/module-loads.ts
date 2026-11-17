/** Writes the expression that loads a module emitted code names. */
export type ModuleLoad = (specifier: string) => string;

export type ModuleLoads = {
	readonly load?: ModuleLoad;
	/** Loads an event handler, the first code an interaction runs. */
	readonly handler?: ModuleLoad;
	imports(): string | null;
};

export const DEV_RESIDENT_MODULE = '@markless/web/fns/dev-resident';

const nativeLoads: ModuleLoads = { imports: () => null };

const importCall = (specifier: string) => `import(${JSON.stringify(specifier)})`;

// A dev `import()` fetches on first use, a task after the write that reached it; a build has packed code on the page.
function residentModuleLoads(helper: string): ModuleLoads {
	const named = new Set<string>();
	let handlers = false;
	return {
		load(specifier) {
			named.add(specifier);
			return `marklessDevLoad(import.meta.url, ${JSON.stringify(specifier)}, () => ${importCall(specifier)})`;
		},
		handler(specifier) {
			handlers = true;
			return `marklessDevWarmed().then(() => ${importCall(specifier)})`;
		},
		imports: () =>
			named.size === 0 && !handlers
				? null
				: [
						`import { marklessDevLoad, marklessDevWarm, marklessDevWarmed } from ${JSON.stringify(helper)};`,
						named.size > 0
							? `marklessDevWarm(import.meta.url, [${[...named].map((specifier) => `[${JSON.stringify(specifier)}, () => ${importCall(specifier)}]`).join(', ')}]);`
							: '',
					].join('\n'),
	};
}

/** Without a `load`, each emitter writes its own native `import()`, so a build's bytes stay as they are. */
export function moduleLoads(devServer: boolean, helper = DEV_RESIDENT_MODULE): ModuleLoads {
	return devServer ? residentModuleLoads(helper) : nativeLoads;
}
