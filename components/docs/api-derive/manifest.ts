// The vendored `@markless/ui` manifest is the only source of prop and part data
// on this site. It is read as text rather than as a JSON module so the site
// tsconfig needs no `resolveJsonModule`; `vite/client` already types `*?raw`.
import manifestText from '@markless/ui/api/manifest.json?raw';

/** One prop a part accepts, exactly as the family's own types file declares it. */
export type ManifestProp = {
	readonly name: string;
	/** Type text verbatim from the family, newlines and all. */
	readonly type: string;
	readonly required: boolean;
	/** The default written as source text, e.g. `false` or `''`. */
	readonly default?: string;
	readonly doc?: string;
};

/** One part of a family: `accordion.item` is part `item` of family `accordion`. */
export type ManifestPart = {
	readonly part: string;
	readonly component: string;
	readonly doc?: string;
	readonly props: readonly ManifestProp[];
};

export type ManifestFamily = { readonly parts: readonly ManifestPart[] };
export type ApiManifest = Readonly<Record<string, ManifestFamily>>;

export const manifest = JSON.parse(manifestText) as ApiManifest;

/** Every family the manifest carries, in alphabetical order. */
export function familyNames(): readonly string[] {
	return Object.keys(manifest).sort();
}

export function familyOf(family: string): ManifestFamily {
	const found = manifest[family];
	if (!found)
		throw new Error(
			`api-derive: '${family}' is not a family in @markless/ui/api/manifest.json. Known families: ${familyNames().join(', ')}.`,
		);
	return found;
}

/**
 * The family's parts in reading order: `root` first, then the rest
 * alphabetically. A family whose page wants another order says so in its
 * `ui-meta` file and passes the names to `partsInOrder`.
 */
export function partsOf(family: string): readonly ManifestPart[] {
	const parts = [...familyOf(family).parts].sort((left, right) => {
		if (left.part === 'root') return right.part === 'root' ? 0 : -1;
		if (right.part === 'root') return 1;
		return left.part.localeCompare(right.part);
	});
	return parts;
}

export function partsInOrder(family: string, order: readonly string[]): readonly ManifestPart[] {
	return order.map((part) => partOf(family, part));
}

export function partOf(family: string, part: string): ManifestPart {
	const found = familyOf(family).parts.find((one) => one.part === part);
	if (!found)
		throw new Error(
			`api-derive: '${family}' has no part '${part}'. Its parts are: ${familyOf(family)
				.parts.map((one) => one.part)
				.join(', ')}.`,
		);
	return found;
}

export function propOf(family: string, part: string, prop: string): ManifestProp {
	const found = partOf(family, part).props.find((one) => one.name === prop);
	if (!found)
		throw new Error(
			`api-derive: '${family}.${part}' has no prop '${prop}'. Its props are: ${partOf(family, part)
				.props.map((one) => one.name)
				.join(', ')}.`,
		);
	return found;
}

/** Manifest docs are wrapped source comments; a table cell wants one line. */
export function oneLine(text: string | undefined): string {
	return (text ?? '').replace(/\s+/g, ' ').trim();
}
