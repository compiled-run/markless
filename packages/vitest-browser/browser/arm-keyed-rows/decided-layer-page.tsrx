import Ledger from './ledger.tsrx';

function Drawer(props: { open: boolean; name: string }) @{
	<aside>@if (props.open) { <><Ledger id={props.name} /></> } @else { <p>closed</p> }</aside>
}

export default function DecidedLayerPage() @{
	<main>
		<Drawer open={true} name="drawer" />
	</main>
}
