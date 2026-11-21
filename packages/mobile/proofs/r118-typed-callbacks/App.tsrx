import { state } from '@markless/core';
import { toggle } from '@markless/ui';
import Picker from '../lib/Picker.tsrx';

export default function App() @{
	let drink = state('none');
	let cups = state(0);
	let wifi = state(false);
	<main>
		<h1>Typed callbacks</h1>
		<Picker
			onPick={(value: string) => {
				drink = value;
				cups = cups + value.length;
			}}
		/>
		<p>
			Drink {drink}, cups {cups}
		</p>
		<toggle.root onChange={(next: boolean) => (wifi = next)}>
			<toggle.label>Wi-Fi</toggle.label>
			<toggle.trigger>
				<toggle.thumb />
			</toggle.trigger>
		</toggle.root>
		<p>{wifi ? 'Wi-Fi is on' : 'Wi-Fi is off'}</p>
	</main>
}
