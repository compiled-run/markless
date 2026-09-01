// The registry the docs components look a family up in. Adding a family is one
// file beside this one and one line below it; nothing else on the site changes.
import { accordion } from './accordion.ts';
import type { FamilyMeta } from './types.ts';

export * from './keys.ts';
export * from './types.ts';

const registry: Readonly<Record<string, FamilyMeta>> = { accordion };

export function metaFor(family: string): FamilyMeta {
	const found = registry[family];
	if (!found)
		throw new Error(
			`ui-meta: no file for '${family}'. Add components/docs/ui-meta/${family}.ts and register it in index.ts. Registered: ${Object.keys(registry).join(', ')}.`,
		);
	return found;
}

/** The family's file, or undefined where the family has none yet. */
export function metaIfAny(family: string): FamilyMeta | undefined {
	return registry[family];
}

/** Families that have a ui-meta file yet, in alphabetical order. */
export function metaFamilies(): readonly string[] {
	return Object.keys(registry).sort();
}
