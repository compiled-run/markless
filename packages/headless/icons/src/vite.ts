import type { Plugin } from 'vite';
import { CollectionLoader, installedPrefixes } from './collection-loader.ts';
import { packName } from './naming.ts';
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
	const byName = new Map<string, string[]>();
	for (const prefix of prefixes) {
		const name = packName(prefix);
		if (!name) throw new Error(`@markless/icons: collection prefix ${prefix} does not produce a pack name`);
		const group = byName.get(name) ?? [];
		if (!group.includes(prefix)) group.push(prefix);
		byName.set(name, group);
	}
	for (const [name, group] of byName) {
		if (group.length < 2) continue;
		throw new Error(
			`@markless/icons: pack name ${name} is ambiguous between ${group.join(' and ')}; name one explicitly, for example packs: { ${name}: { iconifyPrefix: '${group[0]!}' } }`,
		);
	}
	const packs = new Map([...byName].map(([name, group]) => [name, group[0]!]));
	for (const [name, value] of Object.entries(input.packs ?? {})) packs.set(name, value.iconifyPrefix);
	return {
		debug: input.debug ?? false,
		importSources: new Set(input.importSources ?? ['@markless/icons']),
		packs,
		collections: input.collections,
		loadCollection: input.loadCollection,
	};
}
