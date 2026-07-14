import { state } from '@markless/core';

export function RouterWitness() @{
	const status = state({ ready: true });
	status.ready/*M7_CORE*/;
	const href = '/*M7_ROUTE*/';
	<a href={href}>Library</a>
}
