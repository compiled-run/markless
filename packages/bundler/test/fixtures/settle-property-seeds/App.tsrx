import { computed } from '@markless/core';
import { fetchInbox } from './inbox.ts';

export function App() @{
	const inbox = computed(async ({ signal }) => fetchInbox(signal));

	<main>
		@try {
			<section data-inbox>
				<label><input data-all type="checkbox" indeterminate />All mail</label>
				<audio data-chime volume="0.5" />
				<ul>
					@for (const mail of inbox.mails; key mail.id) {
						<li data-mail={mail.id}><input type="checkbox" indeterminate />{mail.subject}</li>;
					} @empty {
						<li data-empty><input type="checkbox" indeterminate />No mail</li>;
					}
				</ul>
			</section>;
		} @pending {
			<p data-loading>Loading mail</p>;
		}
	</main>;
}
