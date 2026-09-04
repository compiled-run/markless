import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { CollectionLoader } from './collection-loader.ts';
import { nearestName, packName } from './naming.ts';
import type { IconsOptions, ResolvedIconsOptions } from './options.ts';
import { transformMdx } from './transform/mdx.ts';
import { transformTsrx } from './transform/tsrx.ts';

export type { IconPackOptions, IconsOptions } from './options.ts';

export function icons(input: IconsOptions = {}): Plugin {
	const options = resolveOptions(input);
	const loader = new CollectionLoader(options);
	return {
		name: '@markless/icons',
		enforce: 'pre',
		transform: {
			order: 'pre',
			async handler(code, id) {
				const filename = id.split(/[?#]/, 1)[0]!;
				const diagnostic = (message: string) => this.warn(message);
				const transformed = filename.endsWith('.tsrx')
					? await transformTsrx(code, filename, options, loader, diagnostic)
					: filename.endsWith('.mdx')
						? await transformMdx(code, filename, options, loader, diagnostic)
						: undefined;
				if (transformed === undefined) return;
				if (options.debug) this.info(`@markless/icons: transformed ${filename}`);
				return { code: transformed, map: null };
			},
		},
	};
}

function resolveOptions(input: IconsOptions): ResolvedIconsOptions {
	const prefixes = input.availableCollections
		? [...input.availableCollections]
		: installedPrefixes();
	if (input.collections) {
		prefixes.push(...(input.collections instanceof Map ? input.collections.keys() : Object.keys(input.collections)));
	}
	const packs = new Map(prefixes.map((prefix) => [packName(prefix), prefix]));
	for (const [name, value] of Object.entries(input.packs ?? {})) packs.set(name, value.iconifyPrefix);
	for (const [name, prefix] of packs) {
		if (!name) throw new Error(`@markless/icons: collection prefix ${prefix} does not produce a pack name`);
		const collision = [...packs].find(([otherName, otherPrefix]) => otherName === name && otherPrefix !== prefix);
		if (collision) {
			const suggestion = nearestName(prefix, prefixes);
			throw new Error(`@markless/icons: pack name ${name} is ambiguous${suggestion ? ` near ${suggestion}` : ''}`);
		}
	}
	return {
		debug: input.debug ?? false,
		importSources: new Set(input.importSources ?? ['@markless/icons']),
		packs,
		collections: input.collections,
		loadCollection: input.loadCollection,
	};
}

function installedPrefixes(): string[] {
	const directory = fileURLToPath(new URL('../node_modules/@iconify/json/json/', import.meta.url));
	return readdirSync(directory)
		.filter((file) => file.endsWith('.json'))
		.map((file) => file.slice(0, -'.json'.length));
}
