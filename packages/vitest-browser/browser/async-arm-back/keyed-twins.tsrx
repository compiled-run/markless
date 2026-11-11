import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	const rows = [{ key: 'a' }, { key: 'b' }];

	<ol>
		@for (const row of rows; key row.key) {
			<li>
				<Slot name={`${row.key}-top`} />
				<Slot name={`${row.key}-bottom`} />
			</li>
		}
	</ol>
}

function Slot({ name }: { name: string }) @{
	let tick = state(6);
	let showing = state<number | null>(null);

	<div data-board={name}>
		<button data-open onClick={() => (showing = 2)}>Show</button>
		@if (showing !== null) {
			<Note id={showing} tick={tick} hide={(next) => (showing = next)} />
		}
	</div>
}

function Note({ id, tick, hide }: { id: number; tick: number; hide: (next: number | null) => void }) @{
	const title = computed(async () => fetchTitle(id, tick));

	<p data-editor>
		@try {
			<>
				<button data-back onClick={() => hide(null)}>Hide</button> Note "{title}" (#{id})
			</>
		} @pending {} @catch {}
	</p>
}
