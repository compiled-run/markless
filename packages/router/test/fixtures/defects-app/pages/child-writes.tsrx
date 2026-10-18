import { state } from '@markless/core';
import { gridState } from '../src/grid-parts.tsrx';

function CountButton({ label }: { readonly label: string }) @{
	const g = gridState();
	<button
		type="button"
		data-count-button
		onClick={() => {
			if (label) g.picked = g.picked + 1;
		}}
	>
		count
	</button>;
}

function LabelButton({ label }: { readonly label: string }) @{
	const g = gridState();
	<button type="button" data-label-button onClick={() => (g.sort = label)}>
		{label}
	</button>;
}

export default function ChildWritesPage() @{
	const g = gridState();
	let tag = state('tagged');
	<main>
		<CountButton label={tag} />
		<LabelButton label={tag} />
		<output data-shared-picked>{g.picked}</output>
		<output data-shared-sort>{g.sort}</output>
	</main>;
}
