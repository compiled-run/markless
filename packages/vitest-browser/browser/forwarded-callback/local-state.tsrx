import { state } from '@markless/core';
import PressButton from './press-button.tsrx';

function Shelf({ label }: { readonly label: string }) @{
	const shelf = state({ stocked: 0 });

	<p>
		<PressButton onClick={() => { shelf.stocked += 1; }}>{'Stock ' + label}</PressButton>
		<em data-sold={label}>{shelf.stocked}</em>
	</p>
}

export default function LocalState() @{
	<article>
		<Shelf label="cookies" />
		<Shelf label="lemonade" />
	</article>
}
