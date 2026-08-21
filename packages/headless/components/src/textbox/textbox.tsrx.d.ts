// Sidecar types for raw `tsc`, which cannot resolve .tsrx and otherwise falls back
// to the wildcard `*.tsrx` shim (default export only). Props come from one source.
import type {
	TextboxDescriptionProps,
	TextboxErrorProps,
	TextboxLabelProps,
	TextboxTextareaProps,
	TextboxRootProps,
	TextboxInputProps,
} from './textbox-types.ts';

export declare function TextboxRoot(props: TextboxRootProps): unknown;
export declare function TextboxInput(props: TextboxInputProps): unknown;
export declare function TextboxTextarea(props: TextboxTextareaProps): unknown;
export declare function TextboxLabel(props: TextboxLabelProps): unknown;
export declare function TextboxDescription(props: TextboxDescriptionProps): unknown;
export declare function TextboxError(props: TextboxErrorProps): unknown;
