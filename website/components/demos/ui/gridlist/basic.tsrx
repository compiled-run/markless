import { computed, state } from '@markless/core';
import { gridlist, lucide } from '@markless/ui';

export default function Files() @{
	let picked = state<readonly string[]>(['moodboard']);
	let pressed = state('nothing yet');
	const shown = computed(() => (picked.length === 0 ? 'nothing' : picked.join(', ')));

	<div class="desk">
		<gridlist.root
			class="list"
			selectable
			value={picked}
			onChange={(next: readonly string[]) => {
				picked = next;
			}}
		>
			<gridlist.label class="caption">Shared with the studio</gridlist.label>
			<gridlist.item class="row" value="moodboard">
				<gridlist.itemcontent class="cell">
					<gridlist.itemindicator class="tick">
						<lucide.check class="tick-icon" />
					</gridlist.itemindicator>
					<gridlist.itemlabel class="name">moodboard.png</gridlist.itemlabel>
					<span class="size">2.4 MB</span>
					<gridlist.itemtrigger
						class="action"
						onClick={() => {
							pressed = 'Rename moodboard.png';
						}}
					>
						Rename
					</gridlist.itemtrigger>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item class="row" value="invoice">
				<gridlist.itemcontent class="cell">
					<gridlist.itemindicator class="tick">
						<lucide.check class="tick-icon" />
					</gridlist.itemindicator>
					<gridlist.itemlabel class="name">invoice-april.pdf</gridlist.itemlabel>
					<span class="size">88 KB</span>
					<gridlist.itemtrigger
						class="action"
						onClick={() => {
							pressed = 'Rename invoice-april.pdf';
						}}
					>
						Rename
					</gridlist.itemtrigger>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item class="row" value="sardines">
				<gridlist.itemcontent class="cell">
					<gridlist.itemindicator class="tick">
						<lucide.check class="tick-icon" />
					</gridlist.itemindicator>
					<gridlist.itemlabel class="name">sardines-on-toast.jpg</gridlist.itemlabel>
					<span class="size">1.1 MB</span>
					<gridlist.itemtrigger
						class="action"
						onClick={() => {
							pressed = 'Rename sardines-on-toast.jpg';
						}}
					>
						Rename
					</gridlist.itemtrigger>
				</gridlist.itemcontent>
			</gridlist.item>
		</gridlist.root>
		<p class="readout">
			Picked: <span class="readout-value picked">{shown}</span>
		</p>
		<p class="readout">
			Last button: <span class="readout-value pressed">{pressed}</span>
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

			.list {
				display: grid;
				gap: 0.5em;
				margin-block-end: 0.4em;
			}

			.list:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.caption {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			.row {
				border: 1px solid var(--ink);
				border-radius: 6px;
				outline: none;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.row:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.row[ui-selected] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.row:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			.row[ui-disabled] {
				opacity: 0.55;
				cursor: not-allowed;
			}

			.cell {
				display: flex;
				gap: 0.7em;
				align-items: center;
				padding: 0.55em 0.8em;
			}

			.tick {
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 1.3em;
				height: 1.3em;
				flex: none;
				border: 1px solid var(--ink);
				border-radius: 4px;
				background: var(--paper);
			}

			.tick-icon {
				width: 0.95em;
				height: 0.95em;
				visibility: hidden;
			}

			.tick[ui-selected] .tick-icon {
				visibility: visible;
			}

			.name {
				flex: 1;
				min-width: 0;
				overflow-wrap: anywhere;
			}

			.size {
				white-space: nowrap;
			}

			.action {
				padding: 0.2em 0.6em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.action:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.action:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.action:disabled {
				cursor: not-allowed;
			}

			.readout {
				margin: 0;
			}

			.readout-value {
				color: var(--ink);
				font-family: var(--font-mono);
			}

			@media (max-width: 30rem) {
				.size {
					display: none;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.row,
				.action {
					transition: none;
				}
			}
		</style>
	</div>;
}
