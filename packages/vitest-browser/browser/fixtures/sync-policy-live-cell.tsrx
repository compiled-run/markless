import { shared, state } from '@markless/core';

// The family shape: a widget cell shared across parts, one part's key guard
// reading it bare and negated, another part's click writing it. The second
// cell is never written, so the policy's answer for it must not move.
export const picker = shared(
	() => {
		const s = state({ closed: true, locked: true });

		return { ...s };
	},
	{ scope: 'widget' },
);

export function PickerRoot({ children }) @{
	const s = picker();

	<div data-picker-root>
		<output data-picker-closed>{s.closed}</output>
		{children}
	</div>
}

export function PickerField() @{
	const s = picker();

	<input
		type="text"
		data-picker-field
		onKeydown={(event) => {
			if ((event.key === 'Home' && !s.closed) || (event.key === 'End' && s.locked)) {
				event.preventDefault();
			}
		}}
	/>
}

export function PickerToggle() @{
	const s = picker();

	<button type="button" data-picker-toggle onClick={() => (s.closed = !s.closed)}>
		toggle
	</button>
}
