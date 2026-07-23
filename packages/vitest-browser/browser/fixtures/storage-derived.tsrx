import { state, storage } from '@markless/core';

// Optional key: the persistence key is derived from the binding identifier
// (`theme`) -> localStorage key `markless:theme`, no-flash attr `data-markless-theme`.
let theme = storage('light');

export function App() @{
	let wakes = state(0);
	<main data-storage-fixture>
		<output data-theme-value>{theme}</output>
		<output data-wake-count>{wakes}</output>
		<button type="button" data-wake onClick={() => wakes++}>Wake</button>
		<button type="button" data-toggle onClick={() => theme = theme === 'light' ? 'dark' : 'light'}>Toggle</button>
	</main>
}
