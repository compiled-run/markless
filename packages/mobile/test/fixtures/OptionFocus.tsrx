import { element, state } from '@markless/core';

function focusChosen(options: ReadonlyArray<HTMLElement> | undefined, fromEnd: boolean): void {
	if (!options) return;
	let wanted: HTMLElement | undefined;
	let end: HTMLElement | undefined;
	for (const option of options) {
		if (option.getAttribute('aria-disabled') === 'true') continue;
		if (wanted === undefined && option.getAttribute('aria-selected') === 'true') wanted = option;
		if (fromEnd) end = option;
		else if (end === undefined) end = option;
	}
	wanted ??= end;
	wanted?.focus();
}

function focusWithin(box: HTMLElement | undefined, item: HTMLElement | undefined): void {
	if (box && item && box.contains(item) && item.hasAttribute('role')) item.scrollIntoView();
}

export default function OptionFocus() @{
	const options = element<HTMLButtonElement[]>();
	const list = element<HTMLDivElement>();
	const outside = element<HTMLButtonElement>();
	let chosen = state('pear');
	<main>
		<button onClick={() => focusChosen(options, false)}>First or chosen</button>
		<button onClick={() => focusChosen(options, true)}>Last or chosen</button>
		<button el={outside} onClick={() => (chosen = 'none')}>Clear</button>
		<button onClick={() => focusWithin(list, outside)}>Outside</button>
		<div el={list} role="listbox">
			<button el={options} role="option" aria-selected={chosen === 'apple' ? 'true' : 'false'}>Apple</button>
			<button el={options} role="option" aria-disabled="true">Fig</button>
			<button el={options} role="option" aria-selected={chosen === 'pear' ? 'true' : 'false'}>Pear</button>
			<button el={options} role="option">Plum</button>
		</div>
	</main>
}
