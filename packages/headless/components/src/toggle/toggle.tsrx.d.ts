// EDITOR FALLBACK ONLY (see ../tsrx-modules.d.ts): tsserver cannot resolve .tsrx
// imports, and the wildcard shim cannot carry named exports, so the barrel's
// re-exports are typed here. markless-tsc resolves the real module and wins.
import type { Children } from '@markless/core';
import type {
	ToggleDescriptionProps,
	ToggleErrorProps,
	ToggleFieldProps,
	ToggleLabelProps,
	ToggleRootProps,
	ToggleThumbProps,
	ToggleTriggerProps,
} from './toggle-types.ts';

export declare function ToggleRoot(props: ToggleRootProps): Children;
export declare function ToggleTrigger(props: ToggleTriggerProps): Children;
export declare function ToggleThumb(props: ToggleThumbProps): Children;
export declare function ToggleLabel(props: ToggleLabelProps): Children;
export declare function ToggleDescription(props: ToggleDescriptionProps): Children;
export declare function ToggleError(props: ToggleErrorProps): Children;
export declare function ToggleField(props: ToggleFieldProps): Children;
