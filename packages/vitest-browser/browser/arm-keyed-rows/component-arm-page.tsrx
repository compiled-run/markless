import Ledger from './ledger.tsrx';

const SHOWN = true;

export default function ComponentArmPage() @{
	<main>
		<Ledger id="outside" />
		@if (SHOWN) { <><Ledger id="inside" /></> }
	</main>
}
