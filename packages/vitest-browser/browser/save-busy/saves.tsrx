import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';
import { addItem, loadItems, server, waitInHandler } from '../mutations-refresh/server.ts';

function SaveButton({ onSave, children }: { readonly onSave?: () => Promise<void>; readonly children?: Children }) @{
	<button type="button" data-child-save onClick={async () => { await onSave?.(); }}>{children}</button>
}

// Handlers here write no state: only the save tells the page that what it shows will load again.
export function Saves() @{
	let poll = state(0);
	const shelf = computed(async () => {
		poll;
		return await loadItems();
	});

	<main>
		<button type="button" data-like onClick={async () => await addItem('Grace')}>Like</button>
		<button
			type="button"
			data-check-save
			onClick={async () => {
				await waitInHandler();
				await addItem('Grace');
			}}
		>
			Check, then save
		</button>
		<button type="button" data-noop onClick={async () => await waitInHandler()}>Wait</button>
		<button
			type="button"
			data-ignore-status
			onClick={async () => void (await fetch('/mut/items', { method: 'POST', body: 'Ivy' }))}
		>
			Save without reading the answer
		</button>
		<button
			type="button"
			data-start-poll
			onClick={() => void server.pollGate?.then(() => setTimeout(() => (poll = poll + 1)))}
		>
			Poll
		</button>
		<SaveButton onSave={async () => await addItem('Linus')}>Save from a child</SaveButton>
		<button
			type="button"
			data-same-key-save
			onClick={async () => {
				poll = poll;
				await addItem('Grace');
			}}
		>
			Write the same key, then save
		</button>
		<button
			type="button"
			data-save-then-wait
			onClick={async () => {
				await addItem('Grace');
				await waitInHandler();
			}}
		>
			Save, then wait
		</button>
		@try {
			<section>
				<p data-names>{shelf.items.join(', ')}</p>
				<button type="button" data-fail onClick={async () => await addItem('Bad')}>Save, refused</button>
				<form
					data-form
					onSubmit={async (event) => {
						event.preventDefault();
						await addItem('Form');
					}}
				>
					<button type="submit" data-form-submit>Save the form</button>
				</form>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
