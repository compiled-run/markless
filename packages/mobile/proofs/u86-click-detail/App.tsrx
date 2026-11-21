import { element, state } from '@markless/core';

export default function ClickDetail() @{
	let last = state('No click yet');
	const spot = element<HTMLButtonElement>();
	<main>
		<button
			el={spot}
			onClick={(event) => {
				let marks = '';
				for (let press = 0; press < event.detail; press++) marks += '*';
				last = event.detail === 0 ? 'Count 0, no press' : `Count ${event.detail} ${marks}`;
			}}
		>
			Press here
		</button>
		<button onClick={() => spot?.click()}>Press by script</button>
		<p>{last}</p>
	</main>
}
