// Sidecar types for raw `tsc`, which cannot resolve .tsrx and otherwise falls back
// to the wildcard `*.tsrx` shim (default export only). Props come from one source.
import type {
	ToggleDescriptionProps,
	ToggleErrorProps,
	ToggleFieldProps,
	ToggleLabelProps,
	ToggleRootProps,
	ToggleThumbProps,
	ToggleTriggerProps,
} from './toggle-types.ts';

export declare function ToggleRoot(props: ToggleRootProps): unknown;
export declare function ToggleTrigger(props: ToggleTriggerProps): unknown;
export declare function ToggleThumb(props: ToggleThumbProps): unknown;
export declare function ToggleLabel(props: ToggleLabelProps): unknown;
export declare function ToggleDescription(props: ToggleDescriptionProps): unknown;
export declare function ToggleError(props: ToggleErrorProps): unknown;
export declare function ToggleField(props: ToggleFieldProps): unknown;
