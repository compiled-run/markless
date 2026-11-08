import { state } from '@markless/core';
import { SpreadButton } from './spread-button.tsrx';

function BarButton({ to }: { readonly to: string }) @{
	let got = state('');
	<span>
		<SpreadButton data-to={to} onClick={() => (got = to)}>{to}</SpreadButton>
		<output data-got={to}>{got}</output>
	</span>
}

export default function Single() @{
	<main>
		<BarButton to="dark" />
	</main>
}
