import { state } from 'arcade';

export function Dashboard() @{
	let status = state("ready");

	<section data-dashboard>{status}</section>
}
