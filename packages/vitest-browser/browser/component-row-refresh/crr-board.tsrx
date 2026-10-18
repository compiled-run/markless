import { computed, state } from '@markless/core';

function Tile({ code, gated, marked, onChoose }) @{
	<article data-tile={code}>
		<em data-mark={code} hidden={!marked}>marked</em>
		<button data-choose={code} disabled={gated} onClick={() => onChoose(code)}>{code}</button>
	</article>
}

// Writes the row-driving state before the text, and renders the text after the rows.
export default function Board() @{
	const tiles = state([{ code: 'k1' }, { code: 'k2' }, { code: 'k3' }, { code: 'k4' }]);
	let marks = state(['k1']);
	let chosen = state('-');
	let count = state(0);
	const shown = computed(() =>
		tiles.map((tile) => ({
			...tile,
			gated: tile.code === 'k4' && marks.length < 2,
			marked: marks.includes(tile.code),
		})),
	);

	<section>
		<div>
			@for (const tile of shown; key tile.code) {
				<Tile
					code={tile.code}
					gated={tile.gated}
					marked={tile.marked}
					onChoose={(code) => {
						if (!marks.includes(code)) marks = [...marks, code];
						chosen = code;
						count = count + 1;
					}}
				/>
			}
		</div>
		<p data-chosen>{chosen}</p>
		<p data-count>{count}</p>
	</section>
}
