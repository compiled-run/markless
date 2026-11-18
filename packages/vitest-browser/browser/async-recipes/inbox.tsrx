import { computed, state } from '@markless/core';
import { loadInbox } from './inbox.ts';
import { onReturn } from './returning.ts';

export default function Inbox() @{
	let returned = state(0);
	const inbox = computed(async ({ signal }) => {
		returned;
		return loadInbox(signal);
	});

	<section
		attach={() => onReturn(() => returned++)}
		onIdle={() => {}}
	>
		@try {
			<p>{inbox.unread} unread</p>
		} @pending {
			<p>Opening the inbox</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
