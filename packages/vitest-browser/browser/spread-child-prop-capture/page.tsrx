import { state } from '@markless/core';
import { SpreadButton } from './spread-button.tsrx';

function BarButton({ to }: { readonly to: string }) @{
	let got = state('');
	<span>
		<SpreadButton data-to={to} onClick={() => (got = to)}>{to}</SpreadButton>
		<output data-got={to}>{got}</output>
	</span>
}

export default function Page() @{
	<main>
		<BarButton to="dark" />
		<BarButton to="light" />
	</main>
}
