import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	let round = state(0);
	let failing = state(false);
	let editing = state<number | null>(null);

	<div>
		<button data-open onClick={() => (editing = 3)}>Open</button>
		<button data-refresh onClick={() => round++}>Refresh</button>
		<button data-fail onClick={() => { failing = true; round++; }}>Fail</button>
		@if (editing !== null) {
			<Editor id={editing} round={round} failing={failing} close={() => (editing = null)} />
		}
	</div>
}

function Editor({ id, round, failing, close }: { id: number; round: number; failing: boolean; close: () => void }) @{
	const title = computed(async () => fetchTitle(id, round, failing));

	<section data-editor>
		<div data-head>
			@try {
				<>
					<button data-back onClick={() => close()}>Back</button> Editing "{title}" (#{id})
				</>
			} @pending {} @catch {}
		</div>
	</section>
}
