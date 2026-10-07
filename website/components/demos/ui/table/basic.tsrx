import { computed, state } from '@markless/core';
import { table } from '@markless/ui';

export default function Pantry() @{
	let picked = state<readonly string[]>(['jam']);
	let asked = state('nothing yet');
	const shown = computed(() => (picked.length === 0 ? 'nothing' : picked.join(', ')));

	<div class="desk">
		<table.root
			class="grid"
			value={picked}
			sort={{ column: 'jars', direction: 'descending' }}
			onChange={(next: readonly string[]) => {
				picked = next;
			}}
			onSortChange={(column: string) => {
				asked = column;
			}}
		>
			<caption class="caption">What the pantry put up</caption>
			<thead>
				<tr>
					<th class="head">Preserve</th>
					<table.coltrigger class="head sorts" value="jars">Jars</table.coltrigger>
					<table.coltrigger class="head sorts" value="sealed">Sealed</table.coltrigger>
				</tr>
			</thead>
			<tbody>
				<table.item class="row" value="jam">
					<table.itemcontent class="cell" rowheader>Damson jam</table.itemcontent>
					<table.itemcontent class="cell">48</table.itemcontent>
					<table.itemcontent class="cell">In August</table.itemcontent>
				</table.item>
				<table.item class="row" value="chutney">
					<table.itemcontent class="cell" rowheader>Green tomato chutney</table.itemcontent>
					<table.itemcontent class="cell">31</table.itemcontent>
					<table.itemcontent class="cell">Last week</table.itemcontent>
				</table.item>
				<table.item class="row" value="marmalade">
					<table.itemcontent class="cell" rowheader>Seville marmalade</table.itemcontent>
					<table.itemcontent class="cell">12</table.itemcontent>
					<table.itemcontent class="cell">In March</table.itemcontent>
				</table.item>
			</tbody>
		</table.root>
		<p class="readout">
			Picked: <span class="readout-value picked">{shown}</span>
		</p>
		<p class="readout">
			Sort asked for: <span class="readout-value asked">{asked}</span>
		</p>

		<style>
			.desk {
				display: grid;
				gap: 0.5em;
				width: min(31rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.grid {
				display: table;
				width: 100%;
				margin: 0 0 0.4em;
				border: 1px solid var(--ink);
				border-collapse: separate;
				font-size: inherit;
				border-radius: 6px;
				border-spacing: 0;
				overflow: clip;
			}

			.grid:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.caption {
				padding-block-end: 0.5em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				text-align: start;
			}

			.head,
			.cell {
				padding: 0.55em 0.8em;
				border: 0;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: inherit;
				font-weight: 400;
				letter-spacing: normal;
				text-align: start;
				text-transform: none;
				vertical-align: middle;
				opacity: 1;
			}

			.head {
				border-block-end: 1px solid var(--ink);
			}

			.sorts {
				cursor: pointer;
				transition: background 140ms ease;
			}

			.sorts:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.sorts::after {
				content: '';
				margin-inline-start: 0.4em;
			}

			.sorts[aria-sort='descending']::after {
				content: '↓';
			}

			.sorts[aria-sort='ascending']::after {
				content: '↑';
			}

			.sorts:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -4px;
			}

			.row {
				cursor: pointer;
				transition: background 140ms ease;
			}

			.row:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.row[ui-selected] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.grid[ui-disabled] .row {
				opacity: 0.55;
				cursor: not-allowed;
			}

			.row + .row .cell {
				border-block-start: 1px solid var(--ink);
			}

			.cell:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -4px;
			}

			.readout {
				margin: 0;
			}

			.readout-value {
				color: var(--ink);
				font-family: var(--font-mono);
			}

			@media (prefers-reduced-motion: reduce) {
				.sorts,
				.row {
					transition: none;
				}
			}
		</style>
	</div>;
}
