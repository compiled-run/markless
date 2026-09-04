import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { IconifyJSON } from '@iconify/types';
import { getIconData, iconToSVG } from '@iconify/utils';
import { parse } from '@tsrx/yuku';
import { iconProperty, nearestName } from './naming.ts';
import type { ResolvedIconsOptions } from './options.ts';

export interface ResolvedIcon {
	body: string;
	attributes: { width?: string; height?: string; viewBox: string };
	iconName: string;
}

export class CollectionLoader {
	readonly #options: ResolvedIconsOptions;
	readonly #collections = new Map<string, Promise<IconifyJSON>>();
	readonly #lookups = new Map<string, Map<string, string>>();

	constructor(options: ResolvedIconsOptions) {
		this.#options = options;
	}

	async icon(
		prefix: string,
		property: string,
		file: string,
		pack: string,
		diagnostic?: (message: string) => void,
	): Promise<ResolvedIcon> {
		const collection = await this.collection(prefix, file, pack, property);
		let lookup = this.#lookups.get(prefix);
		if (!lookup) {
			lookup = new Map<string, string>();
			for (const name of [...Object.keys(collection.icons), ...Object.keys(collection.aliases ?? {})]) {
				lookup.set(iconProperty(name), name);
			}
			this.#lookups.set(prefix, lookup);
		}
		const iconName = lookup.get(property.toLowerCase());
		if (!iconName) {
			const nearest = nearestName(property, lookup.keys());
			throw new Error(
				`@markless/icons: ${file}: unknown icon ${pack}.${property}${nearest ? `; nearest name is ${pack}.${nearest}` : ''}`,
			);
		}
		const data = getIconData(collection, iconName);
		if (!data) throw new Error(`@markless/icons: ${file}: could not resolve ${pack}.${property}`);
		const svg = iconToSVG(data);
		const sanitized = sanitizeBody(svg.body);
		if (sanitized.changed) {
			diagnostic?.(
				`@markless/icons: ${file}: sanitized unsupported SVG source in ${pack}.${property} (${iconName})`,
			);
		}
		const parsed = parse(`<svg>${sanitized.body}</svg>`, { lang: 'tsx' });
		const fatal = parsed.diagnostics.find((item) => item.severity === 'error');
		if (fatal) {
			throw new Error(
				`@markless/icons: ${file}: unsupported SVG source in ${pack}.${property} (${iconName}): ${fatal.message}`,
			);
		}
		return { ...svg, body: sanitized.body, iconName };
	}

	private collection(prefix: string, file: string, pack: string, property: string) {
		let pending = this.#collections.get(prefix);
		if (!pending) {
			pending = this.load(prefix);
			this.#collections.set(prefix, pending);
		}
		return pending.catch((error: unknown) => {
			this.#collections.delete(prefix);
			throw new Error(
				`@markless/icons: ${file}: failed to load pack ${pack} (${prefix}) for ${pack}.${property}: ${error instanceof Error ? error.message : String(error)}`,
			);
		});
	}

	private async load(prefix: string): Promise<IconifyJSON> {
		const injected =
			this.#options.collections instanceof Map
				? this.#options.collections.get(prefix)
				: this.#options.collections?.[prefix];
		if (injected) return injected;
		const loaded = await this.#options.loadCollection?.(prefix);
		if (loaded) return loaded;
		return JSON.parse(await readFile(resolveCollectionFile(prefix), 'utf8')) as IconifyJSON;
	}
}

/** Where a pack's icon data can live, per-pack package first, then the whole-set bundle. */
function collectionSpecifiers(prefix: string): string[] {
	return [`@iconify-json/${prefix}/icons.json`, `@iconify/json/json/${prefix}.json`];
}

function packageResolve(specifier: string): string {
	// Resolve from the app as well as from here: a per-pack package is the app's dependency,
	// which pnpm does not expose inside this package's own node_modules.
	return createRequire(import.meta.url).resolve(specifier, {
		paths: [process.cwd(), fileURLToPath(new URL('.', import.meta.url))],
	});
}

export function resolveCollectionFile(
	prefix: string,
	resolve: (specifier: string) => string = packageResolve,
): string {
	for (const specifier of collectionSpecifiers(prefix)) {
		try {
			return resolve(specifier);
		} catch {
			continue;
		}
	}
	throw new Error(
		`@markless/icons: collection ${prefix} is not installed; add @iconify-json/${prefix} for this pack alone, or @iconify/json for every pack`,
	);
}

/** Prefixes of the installed collections: every per-pack package plus the whole-set bundle. */
export function installedPrefixes(roots: readonly string[] = searchRoots()): string[] {
	const prefixes = new Set<string>();
	for (const root of roots) {
		for (const name of directoryNames(join(root, 'node_modules', '@iconify-json'))) {
			prefixes.add(name);
		}
	}
	let bundleDirectory: string | undefined;
	try {
		bundleDirectory = join(dirname(packageResolve('@iconify/json/package.json')), 'json');
	} catch {
		bundleDirectory = undefined;
	}
	if (bundleDirectory) {
		for (const file of directoryNames(bundleDirectory)) {
			if (file.endsWith('.json')) prefixes.add(file.slice(0, -'.json'.length));
		}
	}
	return [...prefixes];
}

function directoryNames(directory: string): string[] {
	try {
		return readdirSync(directory).filter((name) => !name.startsWith('.'));
	} catch {
		return [];
	}
}

/** Every directory from the app upward, so a per-pack package hoisted anywhere is found. */
function searchRoots(): string[] {
	const roots = new Set<string>();
	for (const start of [process.cwd(), fileURLToPath(new URL('.', import.meta.url))]) {
		let current = start;
		while (true) {
			roots.add(current);
			const parent = dirname(current);
			if (parent === current) break;
			current = parent;
		}
	}
	return [...roots];
}

function sanitizeBody(body: string): { body: string; changed: boolean } {
	let sanitized = body.replace(/\sstyle=(['"])([^'"]*[{}][^'"]*)\1/g, '');
	sanitized = sanitized.replace(/&(?!#\d+;|#x[\da-f]+;|[a-z][\w.-]*;)/gi, '&amp;');
	return { body: sanitized, changed: sanitized !== body };
}
