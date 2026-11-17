/** Writes the expression that loads a module emitted code names. */
export type ModuleLoad = (specifier: string) => string;

export type ModuleLoads = { readonly load?: ModuleLoad; imports(): string | null };

const nativeLoads: ModuleLoads = { imports: () => null };

// The dev server imports what a build would pack, so a first write finds its code loaded, as packed code is in a build.
function residentModuleLoads(): ModuleLoads {
	const aliases = new Map<string, string>();
	return {
		load(specifier) {
			let alias = aliases.get(specifier);
			if (!alias) aliases.set(specifier, (alias = `marklessResidentModule${aliases.size}`));
			return `marklessDevResident(${alias})`;
		},
		imports: () =>
			aliases.size === 0
				? null
				: [
						"import { marklessDevResident } from '@markless/web/fns/dev-resident';",
						...[...aliases].map(
							([specifier, alias]) => `import * as ${alias} from ${JSON.stringify(specifier)};`,
						),
					].join('\n'),
	};
}

/** Without a `load`, each emitter writes its own native `import()`, so a build's bytes stay as they are. */
export function moduleLoads(devServer: boolean): ModuleLoads {
	return devServer ? residentModuleLoads() : nativeLoads;
}
