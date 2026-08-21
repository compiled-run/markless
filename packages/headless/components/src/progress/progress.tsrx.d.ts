// EDITOR FALLBACK ONLY (see ../tsrx-modules.d.ts): tsserver cannot resolve .tsrx
// imports, and the wildcard shim cannot carry named exports, so the barrel's
// re-exports are typed here. markless-tsc resolves the real module and wins.
import type { Children } from '@markless/core';
import type {
	ProgressIndicatorProps,
	ProgressLabelProps,
	ProgressRootProps,
	ProgressTrackProps,
} from './progress-types.ts';

export declare function ProgressRoot(props: ProgressRootProps): Children;
export declare function ProgressLabel(props: ProgressLabelProps): Children;
export declare function ProgressTrack(props: ProgressTrackProps): Children;
export declare function ProgressIndicator(props: ProgressIndicatorProps): Children;
