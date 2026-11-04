import { state } from '@markless/core';
import { registry } from './outside-lib.ts';

export default function RegistryPage() @{
	let s = state({ count: 0 });
	let op = state('inc');
	<div>
		<output data-o>{s.count}</output>
		<button data-run onClick={() => registry.get(op)?.(s)}>run</button>
	</div>
}
