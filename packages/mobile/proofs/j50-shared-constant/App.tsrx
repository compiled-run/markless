import { shared, state } from '@markless/core';
import { DEFAULT_SIZE, DEFAULT_SIZES } from '../lib/sizes.ts';

const pickerState = shared(
	() => {
		const picker = state({ sizes: DEFAULT_SIZES, chosen: DEFAULT_SIZE });
		return picker;
	},
	{ scope: 'subtree' },
);

function Picker() @{
	const picker = pickerState();
	<section>
		<p>{`Sizes ${picker.sizes.join(' and ')}`}</p>
		<p>{`Chosen ${picker.chosen}`}</p>
		<button onClick={() => (picker.chosen = picker.chosen === 'Small' ? 'Large' : 'Small')}>Switch size</button>
	</section>
}

export default function App() @{
	<main>
		<h1>Sizes</h1>
		<Picker />
	</main>
}
