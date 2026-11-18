import { state } from '@markless/core';
import { choice } from './choice.tsrx';

export function ChoiceCounter() @{
	const c = choice();
	const local = state({ count: 0 });
	<section>
		<p data-shown>{c.value}</p>
		<p data-count>{local.count}</p>
		<button type="button" data-count-up onClick={() => local.count++}>count</button>
		<button type="button" data-manual onClick={() => (c.value = 'manual')}>manual</button>
	</section>
}
