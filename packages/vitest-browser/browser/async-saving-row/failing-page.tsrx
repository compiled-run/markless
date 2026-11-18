import { computed } from '@markless/core';
import HelpNote from './help-note.tsrx';
import { loadFailing } from './profile.ts';

export default function FailingPage() @{
	const profile = computed(async () => loadFailing());

	<article>
		@try {
			<h2>{profile.name}</h2>
		} @pending {
			<p>Loading</p>
		} @catch (failure) {
			<div>
				<p data-error>{failure.message}</p>
				<HelpNote reason="The service did not answer." />
			</div>
		}
	</article>
}
