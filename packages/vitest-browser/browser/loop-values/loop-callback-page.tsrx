import { state } from '@markless/core';

function Picker({
	options,
	onPick,
}: {
	readonly options: readonly string[];
	readonly onPick: (value: string) => void;
}) @{
	<div>
		@for (const option of options; key option) {
			<button data-testid={`pick-${option}`} onClick={() => onPick(option)}>{option}</button>
		}
	</div>
}

export default function App() @{
	let picked = state('none');
	let count = state(0);

	<section>
		<p data-testid="picked">{picked}</p>
		<p data-testid="count">{count}</p>
		<Picker
			options={['red', 'green', 'blue']}
			onPick={(value) => {
				picked = value;
				count += 1;
			}}
		/>
	</section>
}
