import { state } from '@markless/core';

export function App() @{
	let first = state(0);
	let second = state(0);
	let order = state('');
	let solo = state(0);

	const bumpSecond = () => {
		second++;
		order = order + 'B';
	};

	const bumpSolo = () => {
		solo++;
	};

	<main>
		<button
			type="button"
			data-probe
			onClick={[
				() => {
					first++;
					order = order + 'A';
				},
				bumpSecond,
			]}
		>
			click
		</button>
		<button type="button" data-solo onClick={bumpSolo}>solo</button>
		<span data-first>{first}</span>
		<span data-second>{second}</span>
		<span data-order>{order}</span>
		<span data-solo-count>{solo}</span>
	</main>
}
