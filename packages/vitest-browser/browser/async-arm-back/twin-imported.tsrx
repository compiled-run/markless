import { state } from '@markless/core';
import { Sheet } from './imported-editor.tsrx';

export default function Page() @{
	<main>
		<Desk name="west" />
		<Desk name="east" />
	</main>
}

function Desk({ name }: { name: string }) @{
	let round = state(3);
	let editing = state<number | null>(null);

	<div data-board={name}>
		<button data-open onClick={() => (editing = 8)}>Open</button>
		@if (editing !== null) {
			<Sheet id={editing} round={round} close={(next) => (editing = next)} />
		}
	</div>
}
