import { state } from '@markless/core';
import { normalize } from './outside-lib.ts';

export default function NormalizePage() @{
	let form = state({ email: ' Ada@X.io ' });
	<div>
		<output data-o>{'[' + form.email + ']'}</output>
		<button data-b onClick={() => normalize(form)}>n</button>
	</div>
}
