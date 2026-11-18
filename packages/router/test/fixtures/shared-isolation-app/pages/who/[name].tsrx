import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import Badge from '../../src/badge.tsrx';
import { viewer } from '../../src/viewer.tsrx';
import { delayFor, wait } from '../../src/wait.ts';

export default function Who({ params }: PageProps<{ name: string }>) @{
	const v = viewer();
	v.name = params.name;
	const greeting = computed(async () => {
		const before = v.name;
		await wait(null, delayFor(before));
		return `hello ${before}/${v.name}`;
	});

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
