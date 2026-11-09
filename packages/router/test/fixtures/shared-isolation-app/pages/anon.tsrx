import { computed } from '@markless/core';
import Badge from '../src/badge.tsrx';
import { viewer } from '../src/viewer.tsrx';
import { wait } from '../src/wait.ts';

export default function Anon() @{
	const v = viewer();
	const greeting = computed(async () => `hello ${await wait(v.name, 20)}`);

	<main>
		<h1 data-heading>{v.name}</h1>
		@try {
			<section>
				<p data-greeting>{greeting}</p>
				<Badge />
			</section>
		} @pending {
			<p data-pending>pending</p>
		} @catch (error) {
			<p data-caught>{'caught ' + String(error)}</p>
		}
	</main>
}
