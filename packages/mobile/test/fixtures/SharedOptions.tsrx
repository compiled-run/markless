import { element, shared, state } from '@markless/core';

const pickerState = shared(
	() => {
		const picker = state({ open: false, chosen: 'pear' });
		const optionEls = element<HTMLButtonElement[]>();
		return {
			...picker,
			optionEls,
			setOpen(next: boolean) {
				picker.open = next;
			},
		};
	},
	{ scope: 'subtree' },
);

function focusOpening(options: ReadonlyArray<HTMLElement> | undefined): void {
	if (!options) return;
	let wanted: HTMLElement | undefined;
	for (const option of options) {
		if (wanted === undefined && option.getAttribute('ui-chosen') !== null) wanted = option;
	}
	wanted ??= options[0];
	wanted?.focus();
}

function Trigger() @{
	const picker = pickerState();
	<button
		onClick={() => {
			const opening = picker.open !== true;
			picker.setOpen(opening);
			if (opening) focusOpening(picker.optionEls);
		}}
	>{picker.open ? 'Close' : 'Open'}</button>
}

function Option({ value }: { value: string }) @{
	const picker = pickerState();
	<button el={picker.optionEls} ui-chosen={picker.chosen === value}>{value}</button>
}

export default function SharedOptions() @{
	const picker = pickerState();
	<main ui-open={picker.open}>
		<Trigger />
		<Option value="apple" />
		<Option value="pear" />
	</main>
}
