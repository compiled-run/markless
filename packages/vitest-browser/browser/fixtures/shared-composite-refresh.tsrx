import { computed, shared, state } from '@markless/core';

// Minimal repro for the composite-refresh defect. `raw` is a plain path read of
// a shared field; `attr`, `text` and `derived` are the three composite forms.
// All four render the same fact; only `raw` follows the write.
export const box = shared(
	() => {
		const b = state({ checked: false as boolean | 'mixed' });
		const label = computed(() => (b.checked === true ? 'true' : 'false'));

		return {
			...b,
			label,
			toggle() {
				const next = b.checked === true ? false : true;
				b.checked = next;
			},
		};
	},
	{ scope: 'widget' },
);

export function App() @{
	const b = box();

	<div data-repro>
		<button
			type="button"
			data-repro-trigger
			data-raw={b.checked}
			data-attr={b.checked === true ? 'true' : 'false'}
			data-derived={b.label}
			onClick={() => b.toggle()}
		>go</button>
		<output data-repro-text>{b.checked === true ? 'true' : 'false'}</output>
		<output data-repro-raw>{b.checked}</output>
	</div>
}
