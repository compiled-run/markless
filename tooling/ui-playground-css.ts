// The generated chrome's own CSS behind one `pg-` namespace: a demo's authored
// CSS lands in the same scoped block, so a demo class named `panel` or `switch`
// must not collide with the chrome's. The playground card takes every block; an
// example card takes the stage, the code block and the hover-doc registry.

/**
 * The one tip recipe in a card: the control hints and the hover docs share it,
 * and each caller positions its own. Title, sentence and type line are the
 * `tsrx-tip-*` classes the site's fences already use.
 */
function tipLook(tip: string): string {
	return `			${tip} {
				z-index: 40;
				width: max-content;
				max-width: min(36ch, calc(100vw - 2 * var(--space-s-l)));
				margin: 0;
				padding: 0;
				border: 0;
				border-radius: 3px;
				background: var(--slab);
				box-shadow: none;
				color: var(--slab-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1.45;
				text-align: start;
				white-space: normal;
			}

			${tip} .tsrx-tip-title,
			${tip} .tsrx-tip-body,
			${tip} .tsrx-tip-type {
				display: block;
				padding: 0.35em 0.6em;
				font-family: var(--font-mono);
				color: inherit;
			}

			${tip} .tsrx-tip-title {
				background: transparent;
				border-block-end: 1px solid color-mix(in oklch, var(--slab-ink) 30%, transparent);
				font-weight: 700;
			}

			${tip} .tsrx-tip-body:empty {
				display: none;
			}

			${tip} .tsrx-tip-type {
				border-block-start: 1px solid color-mix(in oklch, var(--slab-ink) 30%, transparent);
				opacity: 0.8;
			}`;
}

/**
 * A tip or list pinned to its anchor by the browser, below it and flipping
 * above (and to the other side) when that would leave the viewport. Fixed, so
 * the card's clip never cuts it; the caller names the anchor.
 */
function anchored(anchor: string, area: string): string {
	return `position: fixed;
				inset: auto;
				position-anchor: ${anchor};
				position-area: ${area};
				position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;`;
}

export const CONTROLS_CSS = `			.pg {
				position: relative;
				display: grid;
				/* Sized by the card, never by the widest code line: the code scrolls inside. */
				grid-template-columns: minmax(0, 1fr);
				margin-block: var(--space-s);
				border: 1px solid var(--code-edge);
				border-radius: 3px;
				background: var(--raised);
				overflow: clip;
			}

			.pg-controls {
				display: grid;
				gap: 0.5em;
				padding: 0.7em 0.9em;
				border-block-end: 1px solid var(--code-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em 1.4em;
				align-items: center;
			}

			.pg-rest {
				padding-block-start: 0.6em;
				border-block-start: 1px solid var(--code-edge);
			}

			.pg-rest[ui-closed] {
				display: none;
			}

			.pg-cell {
				display: flex;
				gap: 0.3em;
				align-items: center;
			}

			.pg-ctl {
				display: flex;
				gap: 0.45em;
				align-items: center;
			}

			.pg-name {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
			}

			.pg-switch {
				display: flex;
				align-items: center;
				width: 2.2em;
				height: 1.2em;
				padding: 0.1em;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				cursor: pointer;
			}

			.pg-switch[ui-checked] {
				background: var(--yellow);
			}

			.pg-switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.pg-knob {
				display: block;
				width: 0.9em;
				height: 0.9em;
				border-radius: 999px;
				background: var(--ink);
				transition: transform 130ms ease;
			}

			.pg-switch[ui-checked] .pg-knob {
				transform: translateX(1em);
			}

			.pg-field {
				min-width: 7em;
				padding: 0.2em 0.5em;
				border: 1px solid var(--ink);
				border-radius: 3px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.pg-hint {
				position: relative;
				display: inline-flex;
				align-items: center;
			}

			/* The hint is a quiet superscript, not a second control in the cell. */
			.pg-dot {
				padding: 0 0.15em;
				border: 0;
				background: transparent;
				color: var(--ink);
				opacity: 0.55;
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1;
				text-decoration: underline dotted;
				text-underline-offset: 0.2em;
				cursor: help;
			}

			.pg-dot:hover,
			.pg-dot:focus-visible {
				opacity: 1;
			}

			.pg-tip {
				position: absolute;
				inset-block-start: calc(100% + 0.35em);
				inset-block-end: auto;
				inset-inline-start: 0;
			}

${tipLook('.pg-tip')}

			.pg-tip[ui-closed] {
				display: none;
			}

			/* Named here, not left to the family's layer: the vendored tooltip ships no anchor on its trigger. */
			@supports (position-area: block-end) {
				.pg-hint {
					anchor-scope: --pg-hint;
				}

				.pg-dot {
					anchor-name: --pg-hint;
				}

				.pg-tip {
					${anchored('--pg-hint', 'block-end span-inline-end')}
					margin-block: 0.35em;
				}
			}

			.pg-showall {
				margin-inline-start: auto;
				padding: 0.2em 0.5em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.pg-showall::after {
				content: ' \\203A';
			}

			/* The label follows the trigger's own open attribute, so it flips with the panel. */
			.pg-showall-less,
			.pg-showall[ui-open] .pg-showall-more {
				display: none;
			}

			.pg-showall[ui-open] .pg-showall-less {
				display: inline;
			}

			.pg-showall[ui-open]::after {
				content: ' \\2304';
			}

			.pg-pick {
				position: relative;
			}

			.pg-pick-trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				min-width: 6.5em;
				padding: 0.25em 0.6em;
				border: 1px solid var(--ink);
				border-radius: 3px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				text-align: start;
				cursor: pointer;
			}

			/* The chevron follows the trigger's own open attribute, like an accordion's. */
			.pg-pick-trigger::after {
				content: '\\2304';
				transition: transform 140ms ease;
			}

			.pg-pick-trigger[ui-open]::after {
				transform: rotate(180deg);
			}

			.pg-pick-list {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 5;
				min-width: 8em;
				margin-block: 0.25em;
				padding: 0.2em;
				border: 1px solid var(--ink);
				border-radius: 3px;
				background: var(--paper);
			}

			.pg-pick-list[ui-closed] {
				display: none;
			}

			/* Only the open trigger is an anchor, so each list finds its own. */
			@supports (position-area: block-end) {
				.pg-pick-trigger[ui-open] {
					anchor-name: --pg-pick;
				}

				.pg-pick-list {
					${anchored('--pg-pick', 'block-end span-inline-end')}
				}
			}

			.pg-pick-item {
				padding: 0.25em 0.5em;
				border-radius: 2px;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				cursor: pointer;
			}

			.pg-pick-item:hover,
			.pg-pick-item[ui-selected] {
				background: var(--tinted);
			}

			.pg-log {
				margin: 0;
				padding: 0.5em 0.9em 0;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				color: var(--ink);
			}

			.pg-log-quiet {
				display: none;
			}

			.pg-bar-pick {
				display: flex;
				gap: 0.5em;
				align-items: center;
				padding-block-end: 0.6em;
			}

			.pg-bar-name {
				font-size: var(--step--2);
				font-weight: 700;
				letter-spacing: 0.04em;
				color: var(--ink);
			}

			.pg-bar-trigger {
				min-width: 8.5em;
			}

			.pg-bar-list {
				inset-inline-start: auto;
				inset-inline-end: 0;
			}

			@supports (position-area: block-end) {
				.pg-bar-list {
					inset: auto;
					position-area: block-end span-inline-start;
				}
			}

			/* Full bleed on a phone: the card runs edge to edge, so the page gutter
			   the shell adds is taken back here. */
			@media (max-width: 866px) {
				.pg {
					margin-inline: calc(-1 * var(--space-s-l));
					border-inline: 0;
					border-radius: 0;
				}

				.pg-quick,
				.pg-rest {
					flex-direction: column;
					align-items: start;
				}

				.pg-cell {
					width: 100%;
				}

				.pg-showall {
					margin-inline-start: 0;
				}
			}`;

/** The stage is its own frame inside the card, so the demo reads as the exhibit rather than as more chrome. */
export const STAGE_CSS = `			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 15rem;
				margin: var(--space-s);
				padding: var(--space-s);
				border: 1px solid var(--code-edge);
				border-radius: 2px;
				background: var(--code-surface);
			}`;

export const CODE_CSS = `			/* One row between the stage and the code: the file tabs sit on the left
			   edge and the scenario picker on the right. */
			.pg-bar {
				display: flex;
				/* Reversed wrap puts the picker above the tabs on a phone; it also
				   flips the cross axis, so flex-start here is the visual bottom. */
				flex-wrap: wrap-reverse;
				gap: 0.5em 1em;
				align-items: flex-start;
				justify-content: space-between;
				padding: 0.6em 0.9em 0;
				border-block-start: 1px solid var(--code-edge);
			}

			.pg-code {
				min-width: 0;
				background: var(--code-surface);
			}

			.pg-panel {
				display: block;
				min-width: 0;
				background: var(--raised);
				overflow: clip;
			}

			/* Sits one pixel into the pane border so the selected tab attaches to the code. */
			.pg-strip {
				position: relative;
				z-index: 1;
				margin-block-end: -1px;
				padding: 0;
			}

			.pg-strip-row {
				display: flex;
				gap: 0.2em;
			}

			.pg-tab {
				padding: 0.3em 0.75em;
				border: 1px solid transparent;
				border-block-end: 0;
				border-radius: 3px 3px 0 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.6;
				cursor: pointer;
			}

			.pg-tab[ui-selected] {
				border-color: var(--code-edge);
				background: var(--code-surface);
				opacity: 1;
				font-weight: 700;
			}

			.pg-panes {
				min-width: 0;
				border-block-start: 1px solid var(--code-edge);
				background: var(--code-surface);
			}

			.pg-pane {
				min-width: 0;
			}

			/* The clamp: one per panel, round every tab, so the code always shows and
			   opening it once lifts the ceiling for every file. */
			.pg-clamp {
				position: relative;
			}

			.pg-code-body {
				max-height: 150px;
				overflow: clip;
			}

			.pg-clamp[ui-open] .pg-code-body {
				max-height: none;
				overflow: visible;
			}

			.pg-shiki {
				margin: 0;
				padding: var(--space-s);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 160%;
				overflow-x: auto;
			}

			.pg-line {
				display: block;
				white-space: pre;
				/* A blank line is an empty block; without a floor it has no height. */
				min-height: 1lh;
			}

			.pg-fade {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				background: linear-gradient(to bottom, transparent, var(--code-surface) 70%);
				pointer-events: none;
			}

			/* The whole faded strip is the target, so a reader can click the code
			   they cannot read yet rather than hunting for a small control. */
			.pg-expand {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				display: flex;
				align-items: flex-end;
				justify-content: center;
				padding-bottom: 0.6em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.pg-clamp[ui-open] .pg-fade,
			.pg-clamp[ui-open] .pg-expand {
				display: none;
			}
`;

/**
 * The hover docs of one card: every distinct doc written once in a registry
 * after the code, pinned to whichever token is hovered or focused — the only
 * one carrying the anchor name. `root` is the card's own class.
 */
export function docCss(root: string): string {
	return `			/* Hidden is display: none, never visibility: a hidden fixed, anchored box still costs pre-paint work on every scroll frame. */
			${root} .cp-doc {
				display: none;
				position: absolute;
				inset-inline-start: var(--space-s);
				inset-block-end: 0.5em;
				user-select: none;
			}

${tipLook(`${root} .cp-doc`)}

			${root} .tsrx-hover:is(:hover, :focus-visible) {
				anchor-name: --cp-hot;
			}

			@supports (position-area: block-end) {
				${root} .cp-doc {
					${anchored('--cp-hot', 'block-end span-inline-end')}
					margin-block: 0.35em;
				}
			}`;
}

/** One rule per registry entry: the entry shows while any token naming it is hovered or focused. */
export function docRules(keys: readonly string[], root: string): string {
	return keys
		.map(
			(key) => `			${root}:has(.tsrx-hover[data-doc="${key}"]:is(:hover, :focus-visible)) .cp-doc[data-doc="${key}"] {
				display: block;
			}`,
		)
		.join('\n\n');
}

export const CHROME_CSS = `${CONTROLS_CSS}

${STAGE_CSS}

${CODE_CSS}

${docCss('.pg')}`;

/** A standalone card: the playground's frame round a stage and a code panel. */
export const CODE_PANEL_CSS = `			.cp {
				position: relative;
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				margin-block: var(--space-s);
				border: 1px solid var(--code-edge);
				border-radius: 3px;
				background: var(--raised);
				overflow: clip;
			}

			.cp .pg-bar {
				border-block-start: 0;
			}

			.cp .pg-stage + .pg-code .pg-bar {
				border-block-start: 1px solid var(--code-edge);
			}

${STAGE_CSS}

${docCss('.cp')}

			@media (max-width: 866px) {
				.cp {
					margin-inline: calc(-1 * var(--space-s-l));
					border-inline: 0;
					border-radius: 0;
				}
			}`;
