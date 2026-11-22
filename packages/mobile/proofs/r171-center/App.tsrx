import { state } from '@markless/core';

export default function App() @{
	let votes = state(0);
	<main>
		<center>
			<h1>Poll</h1>
			<p>Votes: {votes}</p>
			<button onClick={() => votes++}>Vote</button>
		</center>
	</main>
}
