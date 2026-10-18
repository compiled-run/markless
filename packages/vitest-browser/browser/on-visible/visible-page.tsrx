import { state } from '@markless/core';

export function App() @{
	let seen = state(false);
	let runs = state(0);

	<section>
		<div
			data-visible
			onVisible={() => {
				seen = true;
				runs = runs + 1;
			}}
		>
			{seen ? 'yes' : 'no'}
		</div>
		<output data-seen>{runs}</output>
	</section>;
}
