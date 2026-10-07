import { checklist, lucide } from '@markless/ui';

export default function ChecklistBasic() @{
	<checklist.root
		class="checklist"
		values={['lettuce', 'tomato', 'mustard']}
		value={['lettuce']}
	>
		<div class="row all">
			<checklist.selectall class="box">
				<lucide.check class="mark-check" aria-hidden="true" />
				<lucide.minus class="mark-mixed" aria-hidden="true" />
			</checklist.selectall>
			<checklist.label class="label">Sandwich condiments</checklist.label>
		</div>
		<checklist.item class="row item" value="lettuce">
			<checklist.itemtrigger class="box">
				<lucide.check class="mark-check" aria-hidden="true" />
			</checklist.itemtrigger>
			<checklist.itemlabel class="label">Lettuce</checklist.itemlabel>
		</checklist.item>
		<checklist.item class="row item" value="tomato">
			<checklist.itemtrigger class="box">
				<lucide.check class="mark-check" aria-hidden="true" />
			</checklist.itemtrigger>
			<checklist.itemlabel class="label">Tomato</checklist.itemlabel>
		</checklist.item>
		<checklist.item class="row item" value="mustard">
			<checklist.itemtrigger class="box">
				<lucide.check class="mark-check" aria-hidden="true" />
			</checklist.itemtrigger>
			<checklist.itemlabel class="label">Mustard</checklist.itemlabel>
		</checklist.item>

		<style>
			.checklist {
				display: grid;
				width: min(20rem, 100%);
				border: 1px solid var(--ink);
				border-radius: 6px;
				overflow: clip;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.row {
				display: flex;
				gap: 0.75em;
				align-items: center;
				padding: 0.6em 1em;
			}

			.all {
				border-block-end: 1px solid var(--ink);
			}

			.item[ui-checked] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.row:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.box {
				display: inline-grid;
				place-items: center;
				box-sizing: border-box;
				flex: none;
				width: 1.25em;
				height: 1.25em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 4px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				cursor: pointer;
			}

			.box:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			.box:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.mark-check,
			.mark-mixed {
				display: none;
				width: 0.95em;
				height: 0.95em;
			}

			.box[ui-checked] .mark-check,
			.box[ui-mixed] .mark-mixed {
				display: block;
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.all .label {
				font-weight: 700;
			}

			[ui-disabled] .label {
				cursor: not-allowed;
			}
		</style>
	</checklist.root>;
}
