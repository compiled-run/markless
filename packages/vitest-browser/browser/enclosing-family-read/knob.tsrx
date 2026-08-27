import { shared, state } from '@markless/core';
import { barState } from './bar.tsrx';

// A control of ANOTHER family. It roots `knobState` and, in the same component,
// reads the enclosing `barState` to register its focusable element in that bar's
// roster - the mix-and-match a toolbar needs, with no wrapper part in between.
export const knobState = shared(
	() => {
		const knob = state({ name: '', taps: 0 });

		return { ...knob };
	},
	{ scope: 'widget' },
);

export function Knob({ name }) @{
	const knob = knobState();
	const bar = barState();
	knob.name = name;

	<button
		type="button"
		data-knob
		data-name={knob.name}
		data-taps={knob.taps}
		el={bar.itemEls}
		tabindex={0}
		onClick={() => {
			knob.taps = knob.taps + 1;
		}}
	>{knob.name}</button>
}

// The axis that isolates "another module" from "roots a family of its own":
// same import, same registration, no family of its own.
export function Plain({ name }) @{
	const bar = barState();

	<button type="button" data-knob data-name={name} el={bar.itemEls} tabindex={0}>{name}</button>
}
