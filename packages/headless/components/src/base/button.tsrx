import { computed, type PropsOf, state } from '@markless/core';

type ButtonProps = Pick<PropsOf<'button'>, 'children' | 'disabled'> & {
	/**
	 * Provide it and the button becomes a toggle button: it reports `aria-pressed`
	 * and flips on every activation. Omit it and this is a plain button, with no
	 * pressed state for a reader to announce.
	 */
	readonly pressed?: boolean;
	/**
	 * Called with the new state each time a person flips a toggle button. Omit it
	 * and the button still flips; the call site simply does nothing.
	 */
	readonly onChange?: (pressed: boolean) => void;
};

export default function Button({ pressed, disabled, onChange, children }: ButtonProps) @{
	// Seeded, not read from the prop in the handler: a handler reading a prop no call
	// site passes is a build error (MARKLESS_CAPTURE_OPAQUE_PROP), and a plain button passes neither.
	const press = state({ isToggle: pressed !== undefined, pressed: pressed === true });
	// A computed, not the comparison inline: a composite attribute expression renders once and never refreshes.
	const ariaPressed = computed(() =>
		press.isToggle ? (press.pressed ? 'true' : 'false') : undefined,
	);

	<button
		type="button"
		disabled={disabled}
		aria-pressed={ariaPressed}
		ui-pressed={press.pressed}
		onClick={() => {
			if (!press.isToggle) return;
			press.pressed = press.pressed !== true;
			onChange?.(press.pressed);
		}}
	>{children}</button>
}
