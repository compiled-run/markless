import { state } from '@markless/core';

export function Note() @{
	let count = state(1);
	<section>
		<h2>Title</h2>
		@{
			const greeting = 'hello';
			const doubled = count * 2;
			<p data-inner title={greeting} onClick={() => count++}>{greeting} {doubled}</p>
		}
	</section>
}
