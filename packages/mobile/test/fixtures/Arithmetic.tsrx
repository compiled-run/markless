import { state } from '@markless/core';

export function Arithmetic() @{
	let n = state(1);
	let label = state('5');

	<section>
		<p>third {n / 3}</p>
		<p>zero {n * -0}</p>
		<p>big {n * 1e21}</p>
		<p>bad {Number(label + 'x')}</p>
		<p>joined {label + n}</p>
		<p>rounded {Math.round(n * 2.5)}</p>
		<p>{n > 2 ? 'many' : 'few'}</p>
		<p>{label ?? 'none'}</p>
		<p>length {label.length}</p>
		<button onClick={() => { n += 1; label = label + n; }}>Step</button>
	</section>
}
