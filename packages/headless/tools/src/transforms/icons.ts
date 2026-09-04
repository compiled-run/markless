import { icons } from '@markless/icons/vite';
import type { IconsOptions } from '@markless/icons/vite';
import type { Plugin } from 'vite';

const defaultImportSources = ['@markless/ui', '@markless/icons'];

export function iconTransform(input: IconsOptions = {}): NonNullable<Plugin['transform']> {
	const plugin = icons({
		...input,
		importSources: input.importSources ?? defaultImportSources,
	});
	return plugin.transform!;
}
