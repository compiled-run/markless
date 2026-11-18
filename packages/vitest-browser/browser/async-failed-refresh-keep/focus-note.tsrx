import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Notes() @{
	let version = state(0);
	let offline = state(false);

	<main>
		<button data-bump onClick={() => version++}>Bump</button>
		<button data-offline onClick={() => (offline = true)}>Go offline</button>
		<button data-online onClick={() => (offline = false)}>Go online</button>
		<NoteCard version={version} offline={offline} />
	</main>
}

function NoteCard({ version, offline }: { version: number; offline: boolean }) @{
	const heading = computed(async () => fetchTitle(7, version, offline));

	<article>
		@try {
			<label data-card>
				<span data-heading>{heading}</span>
				<input data-note type="text" />
			</label>
		} @pending {} @catch (error) {
			<em data-offline-note>{error.message}</em>
		}
	</article>
}
