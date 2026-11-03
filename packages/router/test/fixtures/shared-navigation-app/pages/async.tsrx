import { computed } from '@markless/core';
import { Link } from '@markless/router';
import { ChoiceButtons, choice } from '../lib/choice.tsrx';
import { labelFor } from '../lib/label.ts';

export default function AsyncPage() @{
	const c = choice();
	const label = computed(async () => labelFor(c.value));
	<main>
		<h1 data-title>{'Async'}</h1>
		<p data-shown>{c.value}</p>
		@try {
			<p data-label>{label.text}</p>
		} @pending {
			<p data-label-pending>pending</p>
		}
		<ChoiceButtons />
		<Link href="/" data-go-home>home</Link>
	</main>
}
