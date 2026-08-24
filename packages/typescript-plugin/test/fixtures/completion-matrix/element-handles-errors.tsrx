import { element, shared } from '@markless/core';

const ehErrors = shared(
	() => {
		const optionEls = element<HTMLDivElement[]>();

		return { optionEls };
	},
	{ scope: 'widget' },
);

export function EhErrorProbe() @{
	const s = ehErrors();

	// A plural handle is many elements, so a single-element method is not on it.
	<button
		type="button"
		onClick={() => {
			s.optionEls.focus();
		}}
	>probe</button>
}
