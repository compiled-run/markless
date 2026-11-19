import { state } from '@markless/core';

type Tag = { on: boolean };
type Row = { name: string; tags: Tag[] };

// The type says each row's tags are a list, but the value is a Set: the write must stop with a named error.
function load(): Row[] {
	return [{ name: 'r', tags: new Set([{ on: false }]) as unknown as Tag[] }];
}

export default function TypedNotAList() @{
	let rows = state<Row[]>(load());
	let count = state(0);

	<main>
		<output data-count>{count}</output>
		<button
			data-mark
			onClick={() => {
				count++;
				for (const row of rows) for (const tag of row.tags) tag.on = true;
			}}
		>
			mark
		</button>
	</main>
}
