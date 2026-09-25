import { state } from '@markless/core';

function Board({ chosen, tiles, mark }) @{
	<ul>
		@for (const tile of tiles; key tile.name) {
			<li data-tile={mark + tile.name} class={chosen === tile.name ? 'hot' : 'cold'}>{chosen === tile.name ? 'yes' : 'no'}</li>
		}
	</ul>
}

function Strip(props) @{
	<ol>
		@for (const cell of props.cells; key cell.name) {
			<li data-cell={props.tag + cell.name} title={props.lit === cell.name ? 'on' : 'off'}>{cell.name}</li>
		}
	</ol>
}

export default function RorProp() @{
	let chosen = state('m');
	let tiles = state([{ name: 'm' }, { name: 'n' }]);
	<section>
		<button type="button" data-choose-n onClick={() => (chosen = 'n')}>n</button>
		<button type="button" data-add-o onClick={() => (tiles = [...tiles, { name: 'o' }])}>add</button>
		<button type="button" data-choose-o onClick={() => (chosen = 'o')}>o</button>
		<Board chosen={chosen} tiles={tiles} mark="b-" />
		<Strip lit={chosen} cells={tiles} tag="live-" />
		<Strip lit="n" cells={tiles} tag="fixed-" />
	</section>
}
