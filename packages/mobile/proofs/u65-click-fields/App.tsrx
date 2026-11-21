import { element, state } from '@markless/core';

export default function App() @{
	let last = state('No click yet');
	const spot = element<HTMLButtonElement>();
	<main>
		<h1>Clicks</h1>
		<button
			el={spot}
			onClick={(event) => {
				const how = event.isTrusted ? 'Tapped' : 'Scripted';
				const where = event.clientX > 0 && event.clientY > 0 ? 'at a point' : 'at 0, 0';
				const keys = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ? 'with a key' : 'no key held';
				last = `${how} ${where}, ${keys}`;
			}}
		>
			Tap here
		</button>
		<button onClick={() => spot?.click()}>Click it by script</button>
		<p>{last}</p>
	</main>
}
