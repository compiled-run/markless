import { state } from '@markless/core';
import { toggle } from '@markless/ui';

export default function App() @{
	let wifi = state(false);
	<main>
		<h1>Toggle</h1>
		<toggle.root onChange={(next) => (wifi = next)}>
			<toggle.label>Wi-Fi</toggle.label>
			<toggle.trigger>
				<toggle.thumb />
			</toggle.trigger>
			<toggle.description>Join known networks</toggle.description>
		</toggle.root>
		<p>{wifi ? 'Wi-Fi is on' : 'Wi-Fi is off'}</p>
	</main>
}
