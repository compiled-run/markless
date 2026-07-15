import { state } from '@markless/core';

export function App() @{
	let blocked = state(true);
	let clicks = state(0);

	<main data-sync-policy-state>
		<button
			type="button"
			data-policy-action
			onClick={(event) => {
				if (blocked) {
					event.preventDefault();
				}
				clicks++;
			}}
		>
			Policy action
		</button>
		<button type="button" data-allow-action onClick={() => blocked = false}>Allow</button>
		<output data-policy-clicks>{clicks}</output>
		<output data-policy-state>{blocked}</output>
	</main>
}
