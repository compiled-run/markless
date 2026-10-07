import { state } from '@markless/core';

function Badge(props: { readonly label: string }) @{
	<i data-badge>{props.label}</i>
}

export default function ParenthesizedExpressions() @{
	let kind = state('text');
	let n = state(0);
	let rows = state([
		{ id: 'a', size: 1 },
		{ id: 'b', size: 2 },
	]);

	<section>
		<button type="button" data-bump onClick={() => n++}>bump</button>
		<button type="button" data-kind onClick={() => kind = kind === 'text' ? 'title' : 'text'}>kind</button>
		<p data-text>{(kind === 'text' ? 'text: ' : 'title: ') + n}</p>
		<p data-math title={(n > 1 ? 'many' : 'few') + ' ' + ((n + 1) * 2)}>{((n))}</p>
		<Badge label={(kind === 'text' ? 'T' : 'H') + (n * 10)} />
		@if ((n % 2) === 1) {
			<b data-odd>odd</b>
		}
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row>{(row.size > 1 ? 'big ' : 'small ') + row.id}</li>
			}
		</ul>
	</section>
}
