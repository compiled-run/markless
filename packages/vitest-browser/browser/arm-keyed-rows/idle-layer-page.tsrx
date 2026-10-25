import Weeks from './weeks.tsrx';

function Layer(props: { mounted: boolean }) @{
	<div data-state="closed" hidden>@if (props.mounted) { <><Weeks id="in-layer" /></> }</div>
}

export default function IdleLayerPage() @{
	<main>
		<Weeks id="inline" />
		<Layer mounted={true} />
	</main>
}
