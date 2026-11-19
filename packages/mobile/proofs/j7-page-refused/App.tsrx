import { state } from '@markless/core';

export default function App() @{
	let count = state(0);
	<main>
		<h1>Page title</h1>
		<button onClick={() => (count = count + 1)}>Count {count}</button>
		<button
			onClick={() => {
				document.title = `Count ${count}`;
			}}
		>
			Rename the page
		</button>
	</main>
}
