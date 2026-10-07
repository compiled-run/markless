import { tree } from '@markless/ui';

export default function Files() @{
	<tree.root class="files" aria-label="Project files">
		<tree.item class="row" level={1}>
			<tree.itemtrigger class="arrow-button">
				<tree.itemindicator class="arrow">▸</tree.itemindicator>
			</tree.itemtrigger>
			<tree.itemlabel>src</tree.itemlabel>
			<tree.itemcontent class="group">
				<tree.item class="row" leaf level={2}>
					<tree.itemlabel>index.ts</tree.itemlabel>
				</tree.item>
				<tree.item class="row" leaf level={2}>
					<tree.itemlabel>app.tsrx</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item class="row" level={1}>
			<tree.itemtrigger class="arrow-button">
				<tree.itemindicator class="arrow">▸</tree.itemindicator>
			</tree.itemtrigger>
			<tree.itemlabel>docs</tree.itemlabel>
			<tree.itemcontent class="group">
				<tree.item class="row" leaf level={2}>
					<tree.itemlabel>guide.md</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item class="row" leaf level={1}>
			<tree.itemlabel>README.md</tree.itemlabel>
		</tree.item>

		<style>
			.files {
				width: min(16rem, 100%);
				font-family: ui-monospace, monospace;
			}

			.row {
				padding: 0.2em 0.4em;
				border-radius: 4px;
			}

			.row[ui-leaf] {
				padding-inline-start: 2em;
			}

			.row:focus-visible {
				outline: 2px solid var(--ink);
			}

			.arrow-button {
				width: 1.4em;
				padding: 0;
				border: 0;
				background: none;
				box-shadow: none;
				color: var(--ink);
				font: inherit;
				cursor: pointer;
			}

			.arrow {
				display: inline-block;
			}

			.arrow[ui-open] {
				rotate: 90deg;
			}

			.group:not([hidden]) {
				margin-inline-start: 1em;
				border-inline-start: 2px dashed var(--ink);
			}
		</style>
	</tree.root>
}
