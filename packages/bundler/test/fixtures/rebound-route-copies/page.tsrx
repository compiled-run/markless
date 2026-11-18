import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	<main>
		<Panel name="one" />
		<section>
			<Panel name="two" />
		</section>
		<Panel name="three" />
	</main>
}

function Panel({ name }: { name: string }) @{
	let version = state(2);
	let picked = state<number | null>(null);

	<div data-board={name}>
		<button data-open onClick={() => (picked = 5)}>Pick</button>
		@if (picked !== null) {
			<Picker id={picked} version={version} dismiss={(next) => (picked = next)} />
		}
	</div>
}

function Picker({ id, version, dismiss }: { id: number; version: number; dismiss: (next: number | null) => void }) @{
	const title = computed(async () => fetchTitle(id, version));

	<form data-editor>
		@try {
			<>
				<button type="button" data-back onClick={() => dismiss(null)}>Cancel</button> Picking "{title}" (#{id})
			</>
		} @pending {} @catch {}
	</form>
}
