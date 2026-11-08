import { state } from '@markless/core';
import { SpreadButton } from './spread-button.tsrx';

function BarButton({ to, inBar }: { readonly to: string; readonly inBar: boolean }) @{
	let got = state('');
	const label = to === 'dark' ? 'Go dark' : 'Go light';
	<span>
		@if (inBar) {
			<SpreadButton class={'toggle toggle-to-' + to} data-to={to} aria-label={label} title={label} onClick={() => (got = to)}>{to}</SpreadButton>
		} @else {
			<button type="button" class={'toggle toggle-to-' + to} data-to={to} aria-label={label} onClick={() => (got = to)}>{to}</button>
		}
		<output data-got={to}>{got}</output>
	</span>
}

export default function Arm() @{
	<main>
		<BarButton to="dark" inBar={true} />
		<BarButton to="light" inBar={true} />
	</main>
}
