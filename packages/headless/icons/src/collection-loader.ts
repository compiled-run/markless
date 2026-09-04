import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
		const require = createRequire(import.meta.url);
		const filename = require.resolve(`@iconify/json/json/${prefix}.json`);
		return JSON.parse(await readFile(filename, 'utf8')) as IconifyJSON;
	}
}

function sanitizeBody(body: string): { body: string; changed: boolean } {
	let sanitized = body.replace(/\sstyle=(['"])([^'"]*[{}][^'"]*)\1/g, '');
	sanitized = sanitized.replace(/&(?!#\d+;|#x[\da-f]+;|[a-z][\w.-]*;)/gi, '&amp;');
	return { body: sanitized, changed: sanitized !== body };
}
