import { icons } from '@markless/icons/vite';
import type { IconsOptions } from '@markless/icons/vite';
import type { Plugin } from 'vite';

/** The icons options `ui()` applies: icon tags imported from `@markless/ui` too. */
export function uiIconsOptions(input: IconsOptions = {}): IconsOptions {
	return { ...input, importSources: input.importSources ?? ['@markless/ui', '@markless/icons'] };
}

export function iconTransform(input: IconsOptions = {}): NonNullable<Plugin['transform']> {
	return icons(uiIconsOptions(input)).transform!;
}
