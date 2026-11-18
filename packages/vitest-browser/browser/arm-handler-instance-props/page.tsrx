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

export default function Page() @{
	<main>
		<section data-group="plain">
			<Choice to="dark" framed={false} />
			<Choice to="light" framed={false} />
		</section>
	</main>
}
