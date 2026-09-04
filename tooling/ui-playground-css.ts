// The generated chrome's own CSS behind one `pg-` namespace: a demo's authored
// CSS lands in the same scoped block, so a demo class named `panel` or `switch`
// must not collide with the chrome's. The playground card takes every block; an
// example card takes the stage, the code block and the hover-doc registry.
//
// The look is the site's paper sticker: a 2px ink edge, one hard accent shadow,
// and only hairlines (`--code-edge`) inside. Every colour, radius and face is a
// token from styles/global.css; the accent is `--pg-accent`, muted on dark paper.

/** The card's one accent: the site's pink, and the same pink let through thinner on dark paper (a mix with the paper would drag its hue). */
function accent(card: string): string {
	return `			${card} {
				--pg-accent: var(--pink);
			}

			html[data-theme='dark'] ${card} {
				--pg-accent: color-mix(in oklch, var(--pink) 60%, transparent);
			}`;
}

/** The outer frame shared by `.pg` and `.cp`. */
function sticker(card: string): string {
	return `			${card} {
				position: relative;
				display: grid;
				/* Sized by the card, never by the widest code line: the code scrolls inside. */
				grid-template-columns: minmax(0, 1fr);
				margin-block: var(--space-m);
				border: 2px solid var(--ink);
				border-radius: 8px;
				background: var(--paper);
				box-shadow: var(--card-shadow);
				overflow: clip;
			}

${accent(card)}

			html[data-theme='dark'] ${card} {
				background: var(--raised);
			}

			/* Full bleed on a phone: the card runs edge to edge, so the page gutter
			   the shell adds is taken back here. */
			@media (max-width: 866px) {
				${card} {
					margin-inline: calc(-1 * var(--space-s-l));
					box-shadow: var(--card-shadow);
				}
			}`;
}

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
				padding: 0.15em 0;
				border: 0;
				border-radius: 6px;
				background: var(--slab);
				box-shadow: 3px 3px 0 var(--pg-accent);
				color: var(--slab-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.4;
				text-align: start;
				white-space: normal;
			}

			${tip} .tsrx-tip-title,
			${tip} .tsrx-tip-body,
			${tip} .tsrx-tip-type {
				display: block;
				background: transparent;
				border: 0;
				color: inherit;
			}

			${tip} .tsrx-tip-title {
				padding: 0.45em 0.75em 0.35em;
				font-family: var(--font-mono);
				font-size: var(--step--2);
				font-weight: 700;
			}

			${tip} .tsrx-tip-body {
				padding: 0 0.75em 0.5em;
			}

			${tip} .tsrx-tip-body:empty {
				display: none;
			}

			${tip} .tsrx-tip-type {
				padding: 0.4em 0.75em;
				border-block-start: 1px solid color-mix(in oklch, var(--slab-ink) 30%, transparent);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.8;
			}

			html[data-theme='dark'] ${tip} {
				background: var(--raised);
				color: var(--ink);
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

/** The site's select: a 2px ink frame, paper inside, the sidebar's caret. */
const PICK_CSS = `			.pg-pick-trigger {
				display: flex;
				gap: 0.7em;
				align-items: center;
				justify-content: space-between;
				min-width: 6.5em;
				padding: 0.3em 0.7em;
				border: 2px solid var(--ink);
				border-radius: 8px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.3;
				text-align: start;
				cursor: pointer;
			}

			.pg-pick-caret {
				width: 1em;
				height: 1em;
				color: currentColor;
				opacity: 0.65;
				transition: transform 140ms ease;
			}

			.pg-pick-trigger[ui-open] .pg-pick-caret {
				transform: rotate(180deg);
			}

			html[data-theme='dark'] .pg-pick-trigger {
				background: var(--raised);
			}

			.pg-pick-list {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 5;
				min-width: 8em;
				margin-block: 0.3em;
				padding: 0.3em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				box-shadow: var(--card-shadow);
			}

			.pg-pick-list:is([ui-closed], [hidden]) {
				display: none;
			}

			html[data-theme='dark'] .pg-pick-list {
				background: var(--raised);
			}

			/* The anchor is scoped to each picker's own root, so a list never resolves another picker's trigger. */
			@supports (position-area: block-end) {
				.pg-pick {
					anchor-scope: --pg-pick;
				}

				.pg-pick-trigger[ui-open] {
					anchor-name: --pg-pick;
				}

				.pg-pick-list {
					${anchored('--pg-pick', 'block-end span-inline-end')}
				}
			}

			.pg-pick-item {
				padding: 0.3em 0.6em;
				border-radius: 4px;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				cursor: pointer;
			}

			.pg-pick-item:hover {
				background: var(--state-hover-bg);
				color: var(--state-hover-fg);
			}

			.pg-pick-item[ui-selected] {
				background: var(--state-selected-bg);
				color: var(--state-selected-fg);
				outline: var(--state-selected-edge);
				box-shadow: var(--state-selected-shadow);
			}`;

/** One focus ring for every control the chrome draws: the site's yellow, as its hover docs use. */
const FOCUS_CSS = `			.pg-switch:focus-visible,
			.pg-dot:focus-visible,
			.pg-showall:focus-visible,
			.pg-pick-trigger:focus-visible,
			.pg-pick-item:focus-visible,
			.pg-field:focus-visible,
			.pg-tab:focus-visible,
			.pg-expand:focus-visible {
				outline: 2px solid var(--yellow);
				outline-offset: 2px;
			}`;

export const CONTROLS_CSS = `${sticker('.pg')}

			.pg-controls {
				display: grid;
				gap: 0.6em;
				padding: 0.85em var(--space-s);
				border-block-end: 1px solid var(--code-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.6em 1em;
				align-items: center;
			}

			.pg-rest {
				padding-block-start: 0.75em;
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
				box-sizing: border-box;
				width: 2.5em;
				height: 1.4em;
				padding: 0.1em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				font-size: var(--step--2);
				cursor: pointer;
			}

			.pg-switch[ui-checked] {
				background: var(--state-selected-bg);
			}

			.pg-switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			/* The knob travels the track's own content width, so it lands flush at either end. */
			.pg-knob {
				display: block;
				width: 0.8em;
				height: 0.8em;
				margin-inline-start: 0;
				border-radius: 999px;
				background: var(--ink);
				transition: margin-inline-start 130ms ease;
			}

			.pg-switch[ui-checked] .pg-knob {
				margin-inline-start: calc(100% - 0.8em);
				background: var(--state-selected-fg);
			}

			html[data-variant='b'] .pg-knob {
				box-sizing: border-box;
				border: 1.5px solid var(--ink);
				background: var(--paper);
			}

			.pg-field {
				min-width: 7em;
				padding: 0.25em 0.6em;
				border: 2px solid var(--ink);
				border-radius: 6px;
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

			.pg-dot {
				display: inline-grid;
				place-items: center;
				box-sizing: border-box;
				width: 1.25em;
				height: 1.25em;
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--ink);
				opacity: 0.6;
				font: inherit;
				font-size: var(--step--2);
				font-weight: 700;
				line-height: 1;
				cursor: help;
			}

			.pg-dot:hover,
			.pg-dot:focus-visible {
				background: var(--state-hover-bg);
				color: var(--state-hover-fg);
				opacity: 1;
			}

			.pg-tip {
				position: absolute;
				inset-block-start: calc(100% + 0.35em);
				inset-block-end: auto;
				inset-inline-start: 0;
			}

${tipLook('.pg-tip')}

			.pg-tip:is([ui-closed], [hidden]) {
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
				display: inline-flex;
				align-items: center;
				gap: 0.2em;
				margin-inline-start: auto;
				padding: 0.3em 0.7em;
				border: 2px solid var(--ink);
				border-radius: 8px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				line-height: 1.3;
				cursor: pointer;
			}

			.pg-showall:hover {
				background: var(--state-hover-bg);
				color: var(--state-hover-fg);
			}

			.pg-showall-caret {
				width: 1em;
				height: 1em;
				color: currentColor;
				transform: rotate(-90deg);
				transition: transform 140ms ease;
			}

			.pg-showall-less,
			.pg-showall[ui-open] .pg-showall-more {
				display: none;
			}

			.pg-showall[ui-open] .pg-showall-less {
				display: inline;
			}

			.pg-showall[ui-open] .pg-showall-caret {
				transform: rotate(0deg);
			}

			.pg-pick {
				position: relative;
			}

${PICK_CSS}

			html[data-theme='dark'] :is(.pg-switch, .pg-field, .pg-showall) {
				background: var(--raised);
			}

			.pg-log {
				margin: 0;
				padding: 0.6em var(--space-s) 0;
				font-family: var(--font-mono);
				font-size: var(--step--2);
				color: var(--ink);
				opacity: 0.8;
			}

			.pg-log-quiet {
				display: none;
			}

			/* The scenario picker: a small-caps label over the select, like a sidebar section. */
			.pg-bar-pick {
				display: grid;
				gap: 0.3em;
				justify-items: start;
				margin-inline-start: auto;
				padding-block-end: 0.6em;
			}

			.pg-bar-name {
				font-size: var(--step--2);
				text-transform: uppercase;
				letter-spacing: 0.08em;
				line-height: 1;
				color: var(--ink);
				opacity: 0.7;
			}

			.pg-bar-trigger {
				min-width: 9em;
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

${FOCUS_CSS}

			@media (max-width: 866px) {
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

				.pg-bar-pick {
					margin-inline-start: 0;
				}
			}`;

/** The stage is plain breathing room inside the outer frame. */
export const STAGE_CSS = `			.pg-stage {
				display: grid;
				place-items: center;
				padding: var(--space-m) var(--space-s);
				background: var(--paper);
			}

			html[data-theme='dark'] .pg-stage {
				background: var(--raised);
			}`;

export const CODE_CSS = `			/* One row between the stage and the code: the file tabs sit on the left
			   edge, attached to the code, and the scenario picker on the right. */
			.pg-bar {
				display: flex;
				/* Reversed wrap puts the picker above the tabs on a phone; it also
				   flips the cross axis, so flex-start here is the visual bottom. */
				flex-wrap: wrap-reverse;
				gap: 0.6em 1em;
				align-items: flex-start;
				justify-content: space-between;
				padding: 0.2em var(--space-s) 0;
			}

			.pg-code {
				min-width: 0;
			}

			.pg-panel {
				display: block;
				min-width: 0;
				overflow: clip;
			}

			/* Sits into the pane edge so the selected tab attaches to the code. */
			.pg-strip {
				position: relative;
				z-index: 1;
				margin-block-end: -2px;
				padding: 0;
			}

			.pg-strip-row {
				display: flex;
				gap: 0.25em;
				align-items: flex-end;
			}

			/* Paper index tabs: the selected one lifted onto the code sheet, the rest quiet. */
			.pg-tab {
				padding: 0.45em 0.9em;
				border: 2px solid transparent;
				border-block-end: 0;
				border-radius: 6px 6px 0 0;
				background: transparent;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.3;
				opacity: 0.6;
				cursor: pointer;
			}

			.pg-tab:hover {
				opacity: 0.85;
			}

			.pg-tab[ui-selected] {
				border-color: var(--ink);
				border-block-end-color: transparent;
				background: var(--paper);
				opacity: 1;
				font-weight: 700;
			}

			html[data-theme='dark'] .pg-tab[ui-selected] {
				background: var(--raised);
			}

			.pg-panes {
				min-width: 0;
			}

			.pg-pane {
				min-width: 0;
			}

			.pg-pane[hidden] {
				display: none;
			}

			/* The clamp: one per panel, round every tab, so the code always shows and
			   opening it once lifts the ceiling for every file. */
			.pg-clamp {
				position: relative;
			}

			.pg-code-body {
				max-height: 10rem;
				overflow: clip;
			}

			.pg-clamp[ui-open] .pg-code-body {
				max-height: none;
				overflow: visible;
			}

			.pg-shiki {
				margin: 0;
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
				height: 5.5rem;
				background: linear-gradient(to bottom, transparent, var(--paper) 75%);
				pointer-events: none;
			}

			html[data-theme='dark'] .pg-fade {
				background: linear-gradient(to bottom, transparent, var(--raised) 75%);
			}

			/* The whole faded strip is the target, so a reader can click the code
			   they cannot read yet rather than hunting for a small control. */
			.pg-expand {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5.5rem;
				display: flex;
				align-items: flex-end;
				justify-content: center;
				gap: 0.4em;
				padding-bottom: 0.75em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				line-height: 1.3;
				cursor: pointer;
			}

			.pg-expand-icons {
				display: inline-flex;
				margin-block-end: 0.1em;
			}

			.pg-expand:hover {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-underline-offset: 0.15em;
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

/** A standalone card: the playground's sticker round a stage and a code panel. */
export const CODE_PANEL_CSS = `${sticker('.cp')}

${STAGE_CSS}

${FOCUS_CSS}

${docCss('.cp')}`;
