import { state } from '@markless/core';
import { lucide, tree } from '@markless/ui';

export default function Files() @{
	const openSrc = true;
	let last = state('nothing yet');

	<div class="desk">
		<tree.root class="files" aria-label="Project files">
			<tree.item
				class="row"
				open={openSrc}
				onChange={(open: boolean) => {
					last = open ? 'src opened' : 'src closed';
				}}
			>
				<div class="line">
					<tree.itemtrigger class="arrow">
						<tree.itemindicator class="arrow-mark">
							<lucide.chevronright class="arrow-icon" aria-hidden="true" />
						</tree.itemindicator>
					</tree.itemtrigger>
					<lucide.folder class="kind" aria-hidden="true" />
					<tree.itemlabel>src</tree.itemlabel>
				</div>
				<tree.itemcontent class="group">
					<tree.item class="row" leaf level={2}>
						<div class="line">
							<lucide.file class="kind" aria-hidden="true" />
							<tree.itemlabel>index.ts</tree.itemlabel>
						</div>
					</tree.item>
					<tree.item class="row" leaf level={2}>
						<div class="line">
							<lucide.file class="kind" aria-hidden="true" />
							<tree.itemlabel>app.tsrx</tree.itemlabel>
						</div>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
			<tree.item
				class="row"
				onChange={(open: boolean) => {
					last = open ? 'docs opened' : 'docs closed';
				}}
			>
				<div class="line">
					<tree.itemtrigger class="arrow">
						<tree.itemindicator class="arrow-mark">
							<lucide.chevronright class="arrow-icon" aria-hidden="true" />
						</tree.itemindicator>
					</tree.itemtrigger>
					<lucide.folder class="kind" aria-hidden="true" />
					<tree.itemlabel>docs</tree.itemlabel>
				</div>
				<tree.itemcontent class="group">
					<tree.item class="row" leaf level={2}>
						<div class="line">
							<lucide.file class="kind" aria-hidden="true" />
							<tree.itemlabel>guide.md</tree.itemlabel>
						</div>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
			<tree.item class="row" leaf>
				<div class="line">
					<lucide.file class="kind" aria-hidden="true" />
					<tree.itemlabel>README.md</tree.itemlabel>
				</div>
			</tree.item>
		</tree.root>
		<p class="readout">
			Last change: <span class="readout-value">{last}</span>
		</p>

		<style>
			.desk {
				display: grid;
				gap: 0.7em;
				width: min(20rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.readout {
				margin: 0;
			}

			.readout-value {
				font-family: var(--font-mono);
			}

			.files {
				display: grid;
				gap: 0.2em;
				box-sizing: border-box;
				width: min(20rem, 100%);
				padding: 0.6em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.files:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			.row {
				display: grid;
				gap: 0.2em;
				outline: none;
			}

			.line {
				display: flex;
				gap: 0.5em;
				align-items: center;
				padding: 0.35em 0.6em;
				border-radius: 6px;
				cursor: default;
				transition: background 140ms ease;
			}

			.row[ui-leaf] > .line {
				padding-inline-start: 2.45em;
			}

			.line:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.row:focus > .line {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.row:focus-visible > .line {
				outline: 2px solid var(--ink);
				outline-offset: -2px;
			}

			.row[ui-disabled] > .line {
				opacity: 0.55;
				cursor: not-allowed;
			}

			.row[ui-disabled] > .line:hover {
				background: transparent;
			}

			.arrow {
				display: grid;
				place-items: center;
				width: 1.35em;
				height: 1.35em;
				padding: 0;
				border: 0;
				border-radius: 4px;
				background: transparent;
				color: var(--ink);
				cursor: pointer;
			}

			.arrow:disabled {
				cursor: not-allowed;
			}

			.arrow-mark {
				display: grid;
				place-items: center;
				transition: rotate 140ms ease;
			}

			.arrow-mark[ui-open] {
				rotate: 90deg;
			}

			.arrow-icon,
			.kind {
				width: 1.1em;
				height: 1.1em;
				flex: none;
			}

			.group {
				display: grid;
				gap: 0.2em;
				margin-inline-start: 1.25em;
				padding-inline-start: 0.4em;
				border-inline-start: 1px solid var(--ink);
			}

			.group[hidden] {
				display: none;
			}

			@media (prefers-reduced-motion: reduce) {
				.line,
				.arrow-mark {
					transition: none;
				}
			}
		</style>
	</div>;
}
