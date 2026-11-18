import { basket } from './basket.tsrx';
import { fill } from './fill.ts';

export default function BasketPage() @{
	const b = basket();

	<section>
		<output data-count>{b.count}</output>
		<output data-note>{b.note}</output>
		<button type="button" data-fill onClick={() => fill(b)}>Fill</button>
	</section>
}
