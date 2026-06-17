import { state } from '@arcadejs/core';

export function Dashboard() @{
	let status = state("ready");

	<section>{status}</section>
}
