import { state } from '@markless/core';

export default function Count() @{
	let count = state(0);

	<div>
		<p>{count}</p>
		<button data-write="sync" onClick={() => count++}>Now</button>
		<button data-write="timeout" onClick={() => setTimeout(() => count++)}>Timer</button>
		<button
			data-write="await"
			onClick={async () => {
				await Promise.resolve();
				count++;
			}}
		>Await</button>
		<button data-write="transition" onClick={() => document.startViewTransition(() => count++)}>Transition</button>
		<button
			data-write="then"
			onClick={() => {
				Promise.resolve().then(() => count++);
			}}
		>Then</button>
	</div>
}
