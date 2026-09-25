import type { MarklessRolldownOptions } from './types.ts';

export const DEPRECATED_NATIVE_PACKING_WARNING =
	'MARKLESS_DEPRECATED_OPTION: `experimentalNativePacking` is deprecated. Native packing is on by default for client production builds; remove the option, or set `packing: false` to opt out.';

export function nativePackingEnabled(
	options: Pick<MarklessRolldownOptions, 'packing' | 'experimentalNativePacking'>,
): boolean {
	return options.packing ?? options.experimentalNativePacking ?? true;
}

export function chunkImportMapEnabled(
	options: Pick<MarklessRolldownOptions, 'packing' | 'experimentalNativePacking'> & {
		readonly chunkImportMap?: boolean;
		readonly dev?: boolean;
	},
): boolean {
	return (
		(options.chunkImportMap ?? options.experimentalNativePacking === true) &&
		nativePackingEnabled(options) &&
		!options.dev
	);
}
