import { state } from '@markless/core';

export function Bin({ kind }: { readonly kind: string }) @{
	const emptied = state({ text: 'none' });
	<p>
		<button type="button" data-shelf={kind} onClick={() => { emptied.text = 'took ' + kind; }}>{kind}</button>
		<output data-shelf-out={kind}>{emptied.text}</output>
	</p>
}
