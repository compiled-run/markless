import { lucide, pagination } from '@markless/ui';

export default function PaginationBasic() @{
	<pagination.root class="pages" aria-label="Results pages" count={5} page={3}>
		<pagination.backtrigger class="page-box" aria-label="Previous page">
			<lucide.chevronleft aria-hidden="true" />
		</pagination.backtrigger>
		<pagination.item value={1}>
			<pagination.itemtrigger class="page-box">1</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={2}>
			<pagination.itemtrigger class="page-box">2</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={3}>
			<pagination.itemtrigger class="page-box">3</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={4}>
			<pagination.itemtrigger class="page-box">4</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={5}>
			<pagination.itemtrigger class="page-box">5</pagination.itemtrigger>
		</pagination.item>
		<pagination.forwardtrigger class="page-box" aria-label="Next page">
			<lucide.chevronright aria-hidden="true" />
		</pagination.forwardtrigger>

		<style>
			.pages {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em;
				justify-content: center;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1;
				color: var(--ink);
			}

			.page-box {
				display: grid;
				place-items: center;
				box-sizing: border-box;
				min-width: 2.2em;
				height: 2.2em;
				padding: 0 0.4em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-variant-numeric: tabular-nums;
				cursor: pointer;
			}

			.page-box svg {
				width: 1em;
				height: 1em;
			}

			.page-box:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.page-box[ui-active] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.page-box:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.page-box:disabled,
			.page-box[aria-disabled='true'] {
				cursor: not-allowed;
				opacity: 0.45;
			}

			.page-box:disabled:hover {
				background: var(--paper);
			}
		</style>
	</pagination.root>;
}
