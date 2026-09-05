import { tooltip } from '@markless/ui';

export default function Save() @{
	<tooltip.root class="save-hint" open={true}>
		<tooltip.trigger class="save-trigger">Save</tooltip.trigger>
		<tooltip.content class="save-tip">Keeps a copy in your drafts</tooltip.content>
		<style>
			.save-hint {
				display: grid;
				justify-items: center;
				anchor-scope: --save-hint;
			}
			.save-trigger {
				anchor-name: --save-hint;
				padding: 0.5em 0.9em;
				border: 1.5px solid #202023;
				border-radius: 4px;
				background: #fff;
				color: #202023;
				font:
					600 1rem/1.4 system-ui,
					sans-serif;
				cursor: pointer;
			}
			.save-trigger:focus-visible {
				outline: 2px dashed #202023;
				outline-offset: 4px;
			}
			.save-tip {
				position: fixed;
				position-anchor: --save-hint;
				position-area: block-start;
				position-try-fallbacks: flip-block, flip-inline;
				inset: auto;
				z-index: 40;
				width: max-content;
				max-width: min(18rem, calc(100vw - 2rem));
				margin: 0.5rem;
				padding: 0.65rem 0.85rem;
				border: 1.5px solid #202023;
				border-radius: 6px;
				background: #fffdf7;
				box-shadow: 3px 4px #e6c4fb;
				color: #202023;
				font:
					400 0.95rem/1.5 system-ui,
					sans-serif;
			}
			.save-tip:is([hidden], [ui-closed]) {
				display: none;
			}
		</style>
	</tooltip.root>
}
