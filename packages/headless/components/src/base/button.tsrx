import { computed, state } from '@markless/core';
import type { ButtonProps } from './base-types.ts';


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
