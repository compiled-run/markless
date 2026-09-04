import type { IconifyJSON } from '@iconify/types';

export interface IconPackOptions {
	iconifyPrefix: string;
}

export interface IconsOptions {
	debug?: boolean;
	importSources?: string[];
	packs?: Record<string, IconPackOptions>;
	availableCollections?: Iterable<string>;
	collections?: Record<string, IconifyJSON> | Map<string, IconifyJSON>;
	loadCollection?: (prefix: string) => IconifyJSON | undefined | Promise<IconifyJSON | undefined>;
}

export interface ResolvedIconsOptions {
	debug: boolean;
	importSources: Set<string>;
	packs: Map<string, string>;
	collections?: Record<string, IconifyJSON> | Map<string, IconifyJSON>;
	loadCollection?: IconsOptions['loadCollection'];
}
