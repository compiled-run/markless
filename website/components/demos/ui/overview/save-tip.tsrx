import { tooltip } from '@markless/ui';

export default function SaveTip() @{
	<section class="frame">
		<tooltip.root open={true}>
			<tooltip.trigger class="save">Save</tooltip.trigger>
			<tooltip.content class="tip">Keeps a copy in your drafts</tooltip.content>
		</tooltip.root>

		<style>
			.tip {
				position-area: inline-end;
				margin-inline-start: 0.5em;
				padding: 0.35em 0.65em;
				border-radius: 4px;
				background: var(--slab);
				color: var(--slab-ink);
				font-size: var(--step--1);
			}

			.frame {
				padding-inline-end: 12rem;
			}

			.save {
				padding: 0.5em 0.9em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-weight: 700;
			}
		</style>
	</section>
}
