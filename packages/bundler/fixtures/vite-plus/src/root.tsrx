import { state } from '@arcade/core';

export function Dashboard() @{
	let status = state("ready");

	<section data-dashboard>{status}</section>
}
