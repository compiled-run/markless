import { state } from '@markless/core';

export default function Ticker() @{
	let symbol = state('ACME');
	let rising = state(true);

	<section>
		<a
			href={`/stocks/${symbol}`}
			class={`ticker ${rising ? 'up' : 'down'}`}
			data-testid={`row-${symbol}`}
		>
			{symbol}
		</a>
		<button
			onClick={() => {
				symbol = 'INIT';
				rising = false;
			}}
		>
			Next
		</button>
	</section>
}
