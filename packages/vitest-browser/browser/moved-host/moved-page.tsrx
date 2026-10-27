import { state } from '@markless/core';
import MovedField from './moved-field.tsrx';

export default function MovedPage() @{
	let seen = state(0);
	<div>
		<section data-layer>
			<MovedField />
		</section>
		<p data-visible onVisible={() => (seen = seen + 1)}>{seen}</p>
		<div data-end></div>
	</div>
}
