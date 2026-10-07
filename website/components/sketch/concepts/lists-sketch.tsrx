// Each row element gets a number the first time the figure sees it, so a reorder shows which elements moved.
import { element, state } from '@markless/core';
import PreviewCard, { Action, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';
import { elementId } from './element-ids.ts';
import { afterUpdate, watchChanges } from './place.ts';

type Grocery = { readonly id: string; readonly name: string };

// Each reset mints new ids, so Reset builds new rows instead of reviving the removed ones.
const fresh = (round: number): readonly Grocery[] => [
	{ id: `pears-${round}`, name: 'Pears' },
	{ id: `coffee-${round}`, name: 'Coffee' },
	{ id: `milk-${round}`, name: 'Milk' },
];

type Seen = { readonly row: number; readonly name: string; readonly ticked: boolean };

const look = (list: HTMLElement | undefined): Seen[] => {
	if (!list) return [];
	return Array.from(list.querySelectorAll<HTMLLIElement>('li.row')).map((li) => {
		const { id } = elementId(li);
		li.dataset.row = String(id);
		return { row: id, name: (li.textContent ?? '').trim(), ticked: li.querySelector('input')?.checked === true };
	});
};

const tickStory = (before: readonly Seen[], after: readonly Seen[]): string => {
	const was = before.find((entry) => entry.ticked);
	if (!was) return '';
	const now = after.find((entry) => entry.row === was.row);
	if (!now) return ` Row ${was.row} left the page, and its tick went with it.`;
	if (now.name === was.name) return ` The tick rode along with ${was.name}.`;
	return ` Row ${was.row} kept its tick, but now it says ${now.name}.`;
};

const tally = (what: string, before: readonly Seen[], after: readonly Seen[]): string => {
	const kept = after.filter((entry) => before.some((old) => old.row === entry.row)).map((entry) => entry.row);
	const keptBefore = before.filter((old) => kept.includes(old.row)).map((old) => old.row);
	const moved = kept.filter((row, at) => keptBefore[at] !== row).length;
	const made = after.length - kept.length;
	const gone = before.length - kept.length;
	const empty = after.length === 0 ? ' The list is empty, so @empty shows.' : '';
	return `${what}: ${moved} moved, ${made} made, ${gone} thrown away.${tickStory(before, after)}${empty}`;
};

const tickNote = (rows: readonly Seen[]): string => {
	const ticked = rows.filter((entry) => entry.ticked);
	if (ticked.length === 0) return '';
	const names = ticked.map((entry) => `${entry.name} on row ${entry.row}`).join(', ');
	return `Ticked: ${names}. The tick lives in that row's element. Now press Reverse.`;
};

const reversed = (list: readonly Grocery[]): readonly Grocery[] => list.slice().reverse();

const withoutTop = (list: readonly Grocery[]): readonly Grocery[] => list.slice(1);

export default function ListsSketch() @{
	let round = state(0);
	let items = state<readonly Grocery[]>(fresh(0));
	let what = state('');
	let prior = state<readonly Seen[]>([]);
	let line = state('');
	let list = element<HTMLUListElement>();

	<PreviewCard name="lists" label="Rows keyed by identity">
		<Controls title="Which row is which?">
			<div class="acts">
				<Action
					onClick={() => {
						prior = look(list);
						what = 'Reverse';
						items = reversed(items);
						watchChanges(list, () => (line = what === '' ? '' : tally(what, prior, look(list))));
						afterUpdate(() => (line = tally(what, prior, look(list))));
					}}
				>
					Reverse
				</Action>
				<Action
					disabled={items.length === 0}
					onClick={() => {
						prior = look(list);
						what = 'Remove top';
						items = withoutTop(items);
						watchChanges(list, () => (line = what === '' ? '' : tally(what, prior, look(list))));
						afterUpdate(() => (line = tally(what, prior, look(list))));
					}}
				>
					Remove top
				</Action>
				<Action
					onClick={() => {
						prior = look(list);
						what = 'Reset';
						round++;
						items = fresh(round);
						watchChanges(list, () => (line = what === '' ? '' : tally(what, prior, look(list))));
						afterUpdate(() => (line = tally(what, prior, look(list))));
					}}
				>
					Reset
				</Action>
			</div>
		</Controls>
		<Stage>
			<div
				class="list"
				onChange={() => {
					what = '';
					line = tickNote(look(list));
				}}
			>
				<ul class="rows" el={list}>
					@for (const item of items; key item.id) {
						<li class="row">
							<label>
								<input type="checkbox" />
								{item.name}
							</label>
						</li>
					} @empty {
						<li class="none">Nothing left to buy.</li>
					}
				</ul>
			</div>
		</Stage>
		<Watch>
			<span hidden={line !== ''}>
				Tick a row, then press Reverse. The numbers show which element on the page each row is.
			</span>
			<span hidden={line === ''}>{line}</span>
		</Watch>
		<style>
			.acts {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em 1.2em;
				margin-inline-start: auto;
			}

			.list {
				display: grid;
				justify-items: center;
				width: 100%;
			}

			.rows {
				display: grid;
				gap: 0.7em;
				width: min(19rem, 100%);
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.row,
			.none {
				display: flex;
				align-items: center;
				min-height: 2.6em;
				box-sizing: border-box;
				padding: 0 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				transition: background 140ms ease;
			}

			.row:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.row:has(:checked) {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.none {
				justify-content: center;
				border-style: dashed;
				color: var(--muted-ink);
			}

			label {
				display: flex;
				flex: 1;
				gap: 0.6em;
				align-items: center;
				align-self: stretch;
				cursor: pointer;
			}

			input {
				width: 1.05em;
				height: 1.05em;
				margin: 0;
				accent-color: var(--ink);

				html.dark & {
					color-scheme: dark;
				}
			}

			input:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.row[data-row]::after {
				content: 'row ' attr(data-row);
				padding: 0.05em 0.5em;
				border: 1px solid var(--pg-edge);
				border-radius: 6px;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--1);
				white-space: nowrap;
			}

			@media (prefers-reduced-motion: reduce) {
				.row {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
