import { lucide, select } from '@markless/ui';

type Mode = 'framework' | 'ui';

export default function ModeSelect({ mode }: { readonly mode: Mode }) @{
	const title = mode === 'framework' ? 'Framework' : 'UI';

	<div class="mode-select-island">
		<style>
			.mode-select-trigger {
				box-sizing: border-box;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.5em;
				inline-size: 100%;
				min-block-size: 2.45rem;
				padding: 0.35em 0.7em;
				font-size: var(--step--1);
				font-weight: 700;
				color: var(--ink);
				background: var(--raised);
				border: 2px solid var(--ink);
				border-radius: 8px;
				text-decoration: none;
			}

			.mode-select-island {
				position: fixed;
				left: var(--space-s-l);
				top: calc(var(--header-height) + 2 * var(--space-s) + 3.4rem + var(--space-m));
				z-index: 35;
				inline-size: 16rem;
				font-size: var(--step--1);
			}

			.mode-select-control {
				position: relative;
			}

			.mode-select-trigger {
				cursor: pointer;
			}

			.mode-select-caret {
				display: inline-flex;
				flex: none;
				opacity: 0.65;
				transition: transform 160ms ease;
			}

			.mode-select-control[ui-open] .mode-select-caret {
				transform: rotate(180deg);
			}

			.mode-select-content {
				position: absolute;
				top: calc(100% + 0.3em);
				left: 0;
				box-sizing: border-box;
				display: grid;
				gap: 0.2em;
				inline-size: 100%;
				padding: 0.3em;
				background: var(--raised);
				border: 2px solid var(--ink);
				border-radius: 8px;
			}

			.mode-select-content[hidden] {
				display: none;
			}

			.mode-select-item {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 0.3em 0.7em;
				color: var(--ink);
				font-size: var(--step--1);
				border: 2px solid transparent;
				border-radius: 6px;
				cursor: pointer;
			}

			.mode-select-item:hover {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.mode-select-item[ui-selected] {
				border-color: var(--pink);
				background: var(--tinted);
				font-weight: 700;
			}

			.mode-select-trigger:focus-visible,
			.mode-select-item:focus-visible {
				outline: 2px solid var(--yellow);
				outline-offset: 2px;
			}

			.mode-select-item[ui-disabled] {
				opacity: 0.5;
				cursor: not-allowed;
			}

			.mode-select-item-indicator[ui-hidden] {
				display: none;
			}

			/* Sidebar select and links. Generated component CSS is scoped with a hash
			   class, so these carry html .prose to outrank it. */
			.mode-select-island {
				position: relative;
				position-anchor: auto;
				inset: auto;
				inline-size: 100%;
				margin-bottom: var(--space-s);
				z-index: 25;
			}

			html .prose .mode-select-trigger {
				background: var(--paper);
				border: 1.5px solid var(--ink);
				border-radius: 3px;
				min-height: 2.7rem;
				box-shadow: 3px 3px 0 var(--purple);
			}

			html .prose .mode-select-content {
				background: var(--paper);
				padding: 0.4rem;
				border: 1.5px solid var(--ink);
				border-radius: 3px;
				box-shadow: 3px 4px 0 var(--purple);
			}

			html .prose .mode-select-item {
				min-height: 2.25rem;
				box-sizing: border-box;
				border: 0;
				border-radius: 1px;
				background: transparent;
				color: var(--ink);
			}

			html .prose .mode-select-item[ui-selected] {
				background: var(--marker-wash);
				font-weight: 700;
			}

			html .prose .mode-select-item[ui-selected]:is(:hover, :focus-visible) {
				background: var(--marker-wash);
			}

			html .prose .mode-select-trigger:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			html .prose .mode-select-item:is(:hover, :focus-visible) {
				background: var(--quiet-fill);
				outline: 1px dashed var(--ink);
				outline-offset: -3px;
			}
		</style>
		<select.root
			class="mode-select-control"
			value={mode}
			name="documentation-mode"
			onChange={(value) => {
				if (value === 'framework') location.assign('/markless');
				if (value === 'ui') location.assign('/markless/ui');
			}}
		>
			<select.label
				style="clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;"
			>Documentation mode</select.label>
			<select.trigger class="mode-select-trigger">
				<span>{title}</span>
				<span class="mode-select-caret" aria-hidden="true">
					<lucide.chevrondown class="ico" />
				</span>
			</select.trigger>
			<select.content class="mode-select-content">
				<select.item class="mode-select-item" value="framework">
					<select.itemlabel class="mode-select-item-label">Framework</select.itemlabel>
					<select.itemindicator class="mode-select-item-indicator">
						<lucide.check class="ico" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
				<select.item class="mode-select-item" value="ui">
					<select.itemlabel class="mode-select-item-label">UI</select.itemlabel>
					<select.itemindicator class="mode-select-item-indicator">
						<lucide.check class="ico" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
			</select.content>
			<select.field />
		</select.root>
	</div>
}
