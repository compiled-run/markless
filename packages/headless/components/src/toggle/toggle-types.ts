import type { Children, PropsOf } from '@markless/core';

export type ToggleRootProps = PropsOf<'div'> & {
	/** Whether the switch reads as on. Omit it and the switch starts off. */
	readonly checked?: boolean;
	readonly disabled?: boolean;
	readonly required?: boolean;
	/** Submitted under this name by `toggle.field`. */
	readonly name?: string;
	/** Submitted instead of the browser default `"on"`. */
	readonly value?: string;
	/**
	 * Intended to be called with the new value when a person flips the switch.
	 * Inert today: a consumer callback cannot be reached from the shared instance
	 * yet (U-B in the goal's parity table), so it is accepted and never invoked.
	 */
	readonly onChange?: (checked: boolean) => void;
	readonly children?: Children;
};

export type ToggleTriggerProps = PropsOf<'button'> & {
	readonly children?: Children;
};

/** The moving piece inside the trigger. It renders an element and nothing else. */
export type ToggleThumbProps = PropsOf<'span'> & {
	readonly children?: Children;
};

export type ToggleLabelProps = PropsOf<'label'> & {
	readonly children?: Children;
};

export type ToggleDescriptionProps = PropsOf<'div'> & {
	readonly children?: Children;
};

export type ToggleErrorProps = PropsOf<'div'> & {
	readonly children?: Children;
};

/**
 * The visually hidden native input that carries the switch into a form. It takes
 * no configuration of its own: `name`, `value` and `required` come from
 * `toggle.root`, so one place decides what a form receives.
 */
export type ToggleFieldProps = PropsOf<'input'>;
