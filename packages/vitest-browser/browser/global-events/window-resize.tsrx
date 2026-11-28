import { state } from '@markless/core';

export function App() @{
	let resizes = state(0);
	let online = state('unknown');

	<main onWindowResize={() => resizes++} onWindowOffline={() => (online = 'offline')}>
		<output data-resizes>{resizes}</output>
		<output data-online>{online}</output>
	</main>
}
