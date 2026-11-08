import { state } from '@markless/core';

const shelves = ['east', 'west'];

export function Shelf({ label }: { readonly label: string }) @{
	const shown = state({ text: 'none' });
	<p>
		<button type="button" data-shelf={label} onClick={() => { shown.text = 'took ' + label; }}>{label}</button>
		<output data-shelf-out={label}>{shown.text}</output>
	</p>
}

export default function ConstShelves() @{
	<main>
		@for (const shelf of shelves; key shelf) {
			<Shelf label={shelf} />
		}
	</main>
}
