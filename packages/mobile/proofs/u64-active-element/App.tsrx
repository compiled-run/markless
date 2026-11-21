import { element, state } from '@markless/core';

export default function App() @{
	let where = state('not checked');
	const card = element<HTMLDivElement>();
	const check = () => {
		let held = false;
		for (const box of [card]) if (box !== undefined && box.contains(document.activeElement)) held = true;
		where = held ? 'inside the card' : 'outside the card';
	};
	<main>
		<h1>Focus</h1>
		<div el={card}>
			<button onClick={check}>Check inside</button>
		</div>
		<button onClick={check}>Check outside</button>
		<p>Focus is {where}</p>
	</main>
}
