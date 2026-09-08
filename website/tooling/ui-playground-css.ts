// Generated chrome and demo CSS share a scoped block; chrome classes need their own namespace.

function accent(card: string): string {
	return `			${card} {
				--pg-accent: color-mix(in srgb, var(--purple) 45%, var(--paper));
				--pg-wash: color-mix(in srgb, var(--purple) 26%, var(--paper));
				--pg-edge: color-mix(in oklch, var(--ink) 80%, transparent);
				--pg-font: 'Shantell Sans', system-ui, sans-serif;

				html.dark & {
					--pg-accent: color-mix(in srgb, var(--purple) 42%, var(--paper));
					--pg-wash: color-mix(in srgb, var(--purple) 20%, var(--paper));
				}
			}`;
}

/** The sticker itself: what `.pg` and `.cp` share. */
function sticker(card: string): string {
	return `			${card} {
				position: relative;
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				margin-block: var(--space-m);
				border: 1.5px solid var(--ink);
				border-radius: 14px;
				background: var(--paper);
				box-shadow: 7px 7px 0 var(--pg-shadow, var(--pg-accent));
				font-family: var(--pg-font);
				font-size: var(--step--1);
				line-height: 1.5;
			}

${accent(card)}

			@media (max-width: 600px) {
				${card} {
					border-radius: 10px;
					box-shadow: 4px 4px 0 var(--pg-shadow, var(--pg-accent));
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
				border: 1px solid var(--pg-edge);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--pg-font);
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

			.pg-pick-list {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 5;
				min-width: 8em;
				margin-block: 0.3em;
				padding: 0.3em;
				border: 1px solid var(--pg-edge);
				border-radius: 6px;
				background: var(--paper);
				box-shadow: 3px 3px 0 var(--pg-accent);
			}

			.pg-pick-list:is([ui-closed], [hidden]) {
				display: none;
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
				font-family: var(--pg-font);
				font-size: var(--step--1);
				cursor: pointer;
			}

			.pg-pick-item:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.pg-pick-item[ui-selected] {
				background: var(--pg-wash);
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
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}`;

export const CONTROLS_CSS = `${sticker('.pg')}

			.pg {
				--pg-shadow: var(--muted-ink);
			}

			.pg-controls {
				display: grid;
				gap: 1em;
				padding: 1.25em 1.35em;
				border-block-end: 1px solid var(--pg-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.9em 2em;
				align-items: center;
			}

			.pg-rest {
				padding-block-start: 1em;
				border-block-start: 1px dashed var(--code-edge);
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
				gap: 0.65em;
				align-items: center;
			}

			.pg-name {
				font-family: var(--pg-font);
				font-size: inherit;
				line-height: 1.3;
				color: var(--ink);
			}

			.pg-switch {
				display: flex;
				align-items: center;
				box-sizing: border-box;
				flex: none;
				width: 3em;
				height: 1.65em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: color-mix(in oklch, var(--switch-off) 20%, var(--paper));
				font-size: inherit;
				transition: background 140ms ease;
				cursor: pointer;
			}

			.pg-switch[ui-checked] {
				background: color-mix(in srgb, var(--switch-on) 65%, var(--paper));
			}

			.pg-switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.pg-knob {
				display: block;
				box-sizing: border-box;
				flex: none;
				width: 1.65em;
				height: 1.65em;
				margin-inline-start: 0;
				margin-block: -1px;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				box-shadow: 1px 1px 1px color-mix(in oklch, var(--ink) 15%, transparent);
				transition: margin-inline-start 130ms ease;
			}

			.pg-switch[ui-checked] .pg-knob {
				margin-inline-start: calc(100% - 1.65em);
			}

			.pg-field {
				min-width: 7em;
				padding: 0.25em 0.6em;
				border: 1px solid var(--pg-edge);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--pg-font);
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
				width: 1.1em;
				height: 1.1em;
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--ink);
				opacity: 0.85;
				font: inherit;
				font-size: inherit;
				font-weight: 700;
				line-height: 1;
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

			.pg-tip:is([ui-closed], [hidden]) {
				display: none;
			}

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
				gap: 0.4em;
				margin-inline-start: auto;
				padding: 0.2em 0.4em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-family: var(--pg-font);
				font-size: inherit;
				line-height: 1.3;
				cursor: pointer;
			}

			.pg-showall:hover {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-underline-offset: 0.15em;
			}

			.pg-showall-caret {
				width: 1em;
				height: 1em;
				color: currentColor;
				opacity: 0.65;
				transform: rotate(0deg);
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
				transform: rotate(180deg);
			}

			.pg-pick {
				position: relative;
			}

${PICK_CSS}

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

			.pg-bar-pick {
				display: flex;
				gap: 0.8em;
				align-items: center;
				margin-inline-start: auto;
				grid-area: 1 / 1;
				align-self: end;
				justify-self: end;
				z-index: 2;
				padding: 0 0.9em 0.4em 0;
			}

			.pg-bar-name {
				font-family: var(--pg-font);
				font-size: inherit;
				line-height: 1.3;
				color: var(--ink);
			}

			.pg-bar-trigger {
				min-width: 7.25em;
				padding: 0.45em 0.8em;
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

			.pg-name,
			.pg-pick-value,
			.pg-pick-item *,
			.pg-showall span {
				font-family: var(--pg-font);
			}

			@media (max-width: 600px) {
				.pg-controls {
					padding: 1em;
				}

				.pg-quick,
				.pg-rest {
					gap: 1em;
				}

			}`;

export const STAGE_CSS = `			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 18rem;
				padding: 2.5em 1.25em 2.25em;
				box-sizing: border-box;
			}`;

export const CODE_CSS = `			.pg-panel-outer {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
			}

			.pg-bar {
				display: flex;
				grid-area: 1 / 1;
				flex-wrap: wrap-reverse;
				gap: 0.6em 1em;
				align-items: flex-start;
				justify-content: space-between;
				padding: 0 0.55em;
			}

			.pg-code {
				min-width: 0;
			}

			.pg-panel {
				display: contents;
				min-width: 0;
			}

			.pg-strip {
				position: relative;
				z-index: 1;
				margin-block-end: -1px;
				padding: 0;
			}

			.pg-strip-row {
				display: flex;
				gap: 0;
				align-items: flex-end;
			}

			.pg-tab {
				padding: 0.65em 1em;
				border: 1px solid var(--pg-edge);
				border-block-end: 0;
				border-radius: 6px 6px 0 0;
				background: var(--paper);
				color: var(--ink);
				font-family: var(--pg-font);
				font-size: var(--step--1);
				line-height: 1.3;
				cursor: pointer;
			}

			.pg-tab:hover {
				background: color-mix(in oklch, var(--pg-wash) 50%, var(--paper));
			}

			.pg-tab[ui-selected] {
				background: var(--pg-wash);
			}

			.pg-tab + .pg-tab {
				margin-inline-start: -1px;
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

			.pg-clamp {
				position: relative;
				grid-area: 2 / 1;
				border-block-start: 1px solid var(--pg-edge);
				border-radius: 0 0 13px 13px;
				overflow: clip;
			}

			.pg-code-body {
				position: relative;
				max-height: 8.5rem;
				overflow: clip;
			}

			.pg-clamp[ui-closed] .pg-source-context {
				display: none;
			}

			.pg-clamp[ui-open] .pg-code-body {
				max-height: none;
				overflow: visible;
			}

			.pg-shiki {
				margin: 0;
				padding: 1em 1.35em;
				border: 0;
				border-radius: 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.875em;
				line-height: 1.6;
				tab-size: 2;
				overflow-x: auto;
			}

			.pg-line {
				display: block;
				white-space: pre;
				min-height: 1lh;
				font-family: var(--font-mono);
			}

			.pg-shiki span {
				font-family: var(--font-mono);
			}

			.pg-fade {
				position: absolute;
				inset: 0 0 -1px;
				background: linear-gradient(to bottom, transparent, var(--paper) 80%);
				pointer-events: none;
			}

			.pg-expand {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 0.4em;
				width: 100%;
				padding: 0.55em 1em 0.8em;
				border: 0;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--pg-font);
				font-size: 0.9em;
				line-height: 1.3;
				cursor: pointer;
			}

			.pg-expand-icon {
				display: block;
				width: 1em;
				height: 1em;
				margin-block-end: 0.1em;
				color: currentColor;
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

			@media (max-width: 600px) {
				.pg-panel-outer:has(.pg-bar-pick) .pg-bar {
					grid-row: 2;
				}

				.pg-panel-outer:has(.pg-bar-pick) .pg-clamp {
					grid-row: 3;
				}

				.pg-bar-pick {
					padding-block-end: 1em;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.pg-switch,
				.pg-knob,
				.pg-pick-caret,
				.pg-showall-caret {
					transition: none;
				}
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
			(
				key,
			) => `			${root}:has(.tsrx-hover[data-doc="${key}"]:is(:hover, :focus-visible)) .cp-doc[data-doc="${key}"] {
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
