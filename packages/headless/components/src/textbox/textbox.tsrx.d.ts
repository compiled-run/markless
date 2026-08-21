// EDITOR FALLBACK ONLY (see ../tsrx-modules.d.ts): tsserver cannot resolve .tsrx
// imports, and the wildcard shim cannot carry named exports, so the barrel's
// re-exports are typed here. markless-tsc resolves the real module and wins.
import type { Children } from '@markless/core';
import type {
	TextboxDescriptionProps,
	TextboxErrorProps,
	TextboxFieldProps,
	TextboxInputProps,
	TextboxLabelProps,
	TextboxRootProps,
	TextboxTextareaProps,
} from './textbox-types.ts';

export declare function TextboxRoot(props: TextboxRootProps): Children;
export declare function TextboxInput(props: TextboxInputProps): Children;
export declare function TextboxTextarea(props: TextboxTextareaProps): Children;
export declare function TextboxLabel(props: TextboxLabelProps): Children;
export declare function TextboxDescription(props: TextboxDescriptionProps): Children;
export declare function TextboxError(props: TextboxErrorProps): Children;
export declare function TextboxField(props: TextboxFieldProps): Children;
