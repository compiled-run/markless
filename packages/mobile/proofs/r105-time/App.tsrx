import { state } from '@markless/core';

export default function App() @{
	let day = state(18);
	<main>
		<h1>Time</h1>
		<p>Posted <time datetime="2026-11-18">November 18</time></p>
		<p>Due <time datetime={'2026-11-' + day}>{'November ' + day}</time></p>
		<p>Batch <data value="398">No. 398</data></p>
		<button onClick={() => day++}>Postpone</button>
	</main>
}
