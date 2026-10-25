import Weeks from './weeks.tsrx';

const SHOWN = true;

export default function IdleArmPage() @{
	<main>
		<Weeks id="direct" />
		@if (SHOWN) { <><Weeks id="in-arm" /></> }
	</main>
}
