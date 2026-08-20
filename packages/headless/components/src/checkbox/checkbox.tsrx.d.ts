// Sidecar types for raw `tsc`, which cannot resolve .tsrx and otherwise falls back
// to the wildcard `*.tsrx` shim (default export only). Props come from one source.
import type {
	CheckboxDescriptionProps,
	CheckboxErrorProps,
	CheckboxFieldProps,
	CheckboxIndicatorProps,
	CheckboxLabelProps,
	CheckboxRootProps,
	CheckboxTriggerProps,
} from './checkbox-types.ts';

export declare function CheckboxRoot(props: CheckboxRootProps): unknown;
export declare function CheckboxTrigger(props: CheckboxTriggerProps): unknown;
export declare function CheckboxIndicator(props: CheckboxIndicatorProps): unknown;
export declare function CheckboxLabel(props: CheckboxLabelProps): unknown;
export declare function CheckboxDescription(props: CheckboxDescriptionProps): unknown;
export declare function CheckboxError(props: CheckboxErrorProps): unknown;
export declare function CheckboxField(props: CheckboxFieldProps): unknown;
