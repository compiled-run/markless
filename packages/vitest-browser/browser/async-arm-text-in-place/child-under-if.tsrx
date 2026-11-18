// A child under a page @if whose @try arm puts text between two elements, with a page-state @if before the @try.
import { computed, state } from '@markless/core';

let loads = 0;
async function loadNote(slug: string) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	loads += 1;
	return { title: slug.toUpperCase(), count: loads };
}

function NoteHeader({ slug, version, pinned }: { slug: string; version: number; pinned: boolean }) @{
	const note = computed(async () => {
		void version;
		return loadNote(slug);
	});

	<header class="note">
		@if (pinned) {
			<em>pinned</em>
		}
		@try {
			<>
				<label>Saved</label>
				{note.title} saved {note.count} times
				<textarea data-body></textarea>
			</>
		} @pending {
			<span>wait</span>
		}
		<a href="#top" data-top>Top</a>
	</header>
}

export default function Notes() @{
	let version = state(0);
	let slug = state<string | null>(null);
	let pinned = state(true);

	<section>
		<button type="button" data-bump onClick={() => version++}>Bump</button>
		<button type="button" data-show onClick={() => (slug = 'alpha')}>Show</button>
		<button type="button" data-unpin onClick={() => (pinned = false)}>Unpin</button>
		@if (slug !== null) {
			<NoteHeader slug={slug} version={version} pinned={pinned} />
		}
	</section>
}
