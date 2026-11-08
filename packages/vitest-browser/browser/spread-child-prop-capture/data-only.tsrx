import { SpreadButton } from './spread-button.tsrx';

function BarButton({ to }: { readonly to: string }) @{
	<SpreadButton data-to={to}>{to}</SpreadButton>
}

export default function DataOnly() @{
	<main>
		<BarButton to="dark" />
		<BarButton to="light" />
	</main>
}
