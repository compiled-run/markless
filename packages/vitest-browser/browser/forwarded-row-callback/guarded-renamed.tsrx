import { state } from '@markless/core';
import { Rack } from './rack.tsrx';

export default function GuardedRenamed() @{
	let taken = state<string[]>([]);

	<section>
		<Rack onTaken={(code) => (taken = [...taken, code])} />
		<output data-taken>{taken.join(',')}</output>
	</section>
}
