import { state } from '@markless/core';

function Choice({ to, framed }: { readonly to: string; readonly framed: boolean }) @{
	let got = state('');
	<span data-choice={to}>
		@if (framed) {
			<button type="button" data-pick={to} onClick={() => (got = to)}>{'framed ' + to}</button>
		} @else {
			<button type="button" data-pick={to} onClick={() => (got = to)}>{'plain ' + to}</button>
		}
		<output data-got={to}>{got}</output>
	</span>
}

export default function Framed() @{
	<main>
		<Choice to="dark" framed={true} />
		<Choice to="light" framed={true} />
	</main>
}
