// Sidecar types for raw `tsc`, which cannot resolve .tsrx and otherwise falls back
// to the wildcard `*.tsrx` shim (default export only). Props come from one source.
import type {
	ProgressIndicatorProps,
	ProgressLabelProps,
	ProgressRootProps,
	ProgressTrackProps,
} from './progress-types.ts';

export declare function ProgressRoot(props: ProgressRootProps): unknown;
export declare function ProgressLabel(props: ProgressLabelProps): unknown;
export declare function ProgressTrack(props: ProgressTrackProps): unknown;
export declare function ProgressIndicator(props: ProgressIndicatorProps): unknown;
