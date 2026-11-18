import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	const lanes = [{ key: 'red' }, { key: 'green' }, { key: 'blue' }];

	<ul>
		@for (const lane of lanes; key lane.key) {
			<li>
				<Lane name={lane.key} />
			</li>
		}
	</ul>
}

function Lane({ name }: { name: string }) @{
	let pass = state(4);
	let editing = state<number | null>(null);

	<div data-board={name}>
		<button data-open onClick={() => (editing = 9)}>Edit</button>
		@if (editing !== null) {
			<Card id={editing} pass={pass} close={(next) => (editing = next)} />
		}
	</div>
}

function Card({ id, pass, close }: { id: number; pass: number; close: (next: number | null) => void }) @{
	const title = computed(async () => fetchTitle(id, pass));

	<div data-editor>
		@try {
			<>
				<button data-back onClick={() => close(null)}>Close</button> Card "{title}" (#{id})
			</>
		} @pending {} @catch {}
	</div>
}
