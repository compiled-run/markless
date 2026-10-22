import type { Plugin } from 'vite';
import { CollectionLoader, installedPrefixes } from './collection-loader.ts';
import { packName } from './naming.ts';
import type { IconsOptions, ResolvedIconsOptions } from './options.ts';
import { transformMdx } from './transform/mdx.ts';
import { transformTsrx } from './transform/tsrx.ts';

export type { IconPackOptions, IconsOptions } from './options.ts';

export const ICON_SOURCE_ID = /\.(?:tsrx|mdx)(?:$|[?#])/;

export function icons(input: IconsOptions = {}): Plugin {
	const options = resolveOptions(input);
	const loader = new CollectionLoader(options);
	// Each query variant of one file (`?markless-symbols`, `?markless-render-data`, ...) arrives with the same code.
	const lastByFile = new Map<
		string,
		{ code: string; result: Promise<{ transformed: string | undefined; warnings: string[] }> }
	>();
	return {
		name: '@markless/icons',
		enforce: 'pre',
		transform: {
			order: 'pre',
			filter: { id: ICON_SOURCE_ID },
			async handler(code, id) {
				const filename = id.split(/[?#]/, 1)[0]!;
				let last = lastByFile.get(filename);
				if (last?.code !== code) {
					const warnings: string[] = [];
					const diagnostic = (message: string) => warnings.push(message);
					const transformed = filename.endsWith('.tsrx')
						? transformTsrx(code, filename, options, loader, diagnostic)
						: filename.endsWith('.mdx')
							? transformMdx(code, filename, options, loader, diagnostic)
							: Promise.resolve(undefined);
					last = {
						code,
						result: transformed.then((value) => ({ transformed: value, warnings })),
					};
					lastByFile.set(filename, last);
					last.result.catch(() => lastByFile.delete(filename));
				}
				const { transformed, warnings } = await last.result;
				for (const message of warnings) this.warn(message);
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
		prefixes.push(
			...(input.collections instanceof Map
				? input.collections.keys()
				: Object.keys(input.collections)),
		);
	}
	const byName = new Map<string, string[]>();
	for (const prefix of prefixes) {
		const name = packName(prefix);
		if (!name)
			throw new Error(
				`@markless/icons: collection prefix ${prefix} does not produce a pack name`,
			);
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
	for (const [name, value] of Object.entries(input.packs ?? {}))
		packs.set(name, value.iconifyPrefix);
	return {
		debug: input.debug ?? false,
		importSources: new Set(input.importSources ?? ['@markless/icons']),
		packs,
		collections: input.collections,
		loadCollection: input.loadCollection,
	};
}
