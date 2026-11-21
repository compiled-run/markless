import { state } from '@markless/core';

function Day({ name, children }: { readonly name: string; readonly children?: unknown }) @{
	<section>
		<h2>{name}</h2>
		@if (children) {
			<div>{children}</div>
		} @else {
			<p>Nothing written on {name}</p>
		}
		<p>{children ? `${name} has a note` : `${name} is blank`}</p>
	</section>
}

export default function App() @{
	let taps = state(0);
	<main>
		<h1>Days</h1>
		<Day name="Monday">
			<p>Taps {taps}</p>
			<button onClick={() => taps++}>Tap</button>
		</Day>
		<Day name="Tuesday" />
		<Day name="Wednesday">Rain all day</Day>
	</main>
}
