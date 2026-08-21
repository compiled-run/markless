// EDITOR FALLBACK ONLY (see ../tsrx-modules.d.ts): tsserver cannot resolve .tsrx
// imports, and the wildcard shim cannot carry named exports, so the barrel's
// re-exports are typed here. markless-tsc resolves the real module and wins.
import type { Children } from '@markless/core';
import type {
	CheckboxDescriptionProps,
	CheckboxErrorProps,
	CheckboxFieldProps,
	CheckboxIndicatorProps,
	CheckboxLabelProps,
	CheckboxRootProps,
	CheckboxTriggerProps,
} from './checkbox-types.ts';

export declare function CheckboxRoot(props: CheckboxRootProps): Children;
export declare function CheckboxTrigger(props: CheckboxTriggerProps): Children;
export declare function CheckboxIndicator(props: CheckboxIndicatorProps): Children;
export declare function CheckboxLabel(props: CheckboxLabelProps): Children;
export declare function CheckboxDescription(props: CheckboxDescriptionProps): Children;
export declare function CheckboxError(props: CheckboxErrorProps): Children;
export declare function CheckboxField(props: CheckboxFieldProps): Children;
