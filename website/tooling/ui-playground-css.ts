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
				box-sizing: border-box;
				width: max-content;
				max-width: min(24rem, calc(100vw - 4rem));
				margin: 0;
				padding: 0.6rem 0.75rem 0.7rem;
				border: var(--tip-border);
				border-radius: var(--tip-radius);
				background: var(--paper);
				box-shadow: var(--tip-shadow);
				color: var(--ink);
				font-family: var(--tip-font);
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
				overflow-wrap: anywhere;
			}

			${tip} .tsrx-tip-title {
				font-weight: 700;
			}

			${tip} .tsrx-tip-code {
				font-family: var(--font-mono);
				font-weight: 500;
			}

			${tip} .tsrx-tip-body {
				margin-block-start: 0.45rem;
				padding-block-start: 0.4rem;
				border-block-start: 1px dashed color-mix(in oklch, var(--ink) 35%, transparent);
			}

			${tip} .tsrx-tip-body:empty {
				display: none;
			}

			${tip} .tsrx-tip-type {
				margin-block-start: 0.45rem;
				padding-block-start: 0.4rem;
				border-block-start: 1px dashed color-mix(in oklch, var(--ink) 35%, transparent);
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

export const CONTROLS_CSS = `${accent('.pg')}

			.pg {
				--pg-shadow: var(--muted-ink);
				--pg-bleed: min(4.6rem, 2 * var(--space-s-l));
				--pg-inset: calc(var(--pg-bleed) / 2 - 1.5px);
				width: calc(100% + var(--pg-bleed));
				box-sizing: border-box;
				margin-inline: calc(var(--pg-bleed) / -2) 0;
			}

			.pg .pg-controls {
				padding-inline-start: var(--pg-inset);
			}

			@media (max-width: 600px) {
				.pg {
					--pg-bleed: 0px;
					--pg-inset: 1em;
				}
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

			${root}:has(.tsrx-hover:hover) .cp-doc {
				animation: tsrx-tip-wait 1ms var(--tip-delay) backwards;
			}

			${root}:has(.tsrx-hover:focus-visible) .cp-doc {
				animation: none;
			}

			html.dark ${root} .cp-doc .tsrx-tip-title span {
				color: var(--shiki-dark);
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


/** The playground on the docs' notebook: the same binder frame, bands, tabs and type as the `<Code>` block. */
export const NOTEBOOK_CSS = `			.pg {
				--pg-band: color-mix(in oklch, var(--ink) 70%, transparent);
				--pg-tab-back: color-mix(in oklch, var(--ink) 9%, var(--paper));
				--pg-tab-h: 2.7rem;
				--pg-bleed: min(4.6rem, 2 * var(--space-s-l));
				--pg-tab-left: calc(var(--pg-bleed) / 2 - 2px);
				--pg-inset: 1.1rem;
				container-type: inline-size;
				position: relative;
				display: flex;
				flex-direction: column;
				box-sizing: border-box;
				width: calc(100% + var(--pg-bleed));
				margin: calc(var(--space-s) + var(--pg-tab-h)) 0 var(--space-l) calc(var(--pg-bleed) / -2);
				padding: 0.25rem var(--pg-inset) 0.4rem 2.6rem;
				border: 2px solid transparent;
				border-image: url('/notebook/frame.png') 40 47 50 72 / 28.6px 33.6px 35.7px 51.4px / 7.1px 14.3px 19.3px 17.9px round;
				border-radius: 0;
				background: var(--paper);
				box-shadow: none;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
			}

			html.dark .pg {
				--paper: var(--raised);
				--pg-tab-back: color-mix(in oklch, var(--ink) 12%, var(--paper));
				border-image-source: url('/notebook/frame-dark.png');
			}

			.pg-head {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem 1rem;
				align-items: center;
				justify-content: space-between;
				padding: 0.35rem 0 0.35rem 0.4rem;
				border-bottom: 2px dashed var(--pg-band);
			}

			.pg-title {
				font-size: var(--step-1);
				line-height: 1.2;
			}

			.pg-body {
				display: flex;
				flex-direction: column;
			}

			.pg-code {
				min-width: 0;
				border-bottom: 2px dashed var(--pg-band);
			}

			.pg-split {
				display: none;
			}

			.pg-stage {
				display: grid;
				place-items: center;
				min-width: 0;
				min-height: 0;
				padding: 1.2rem 0 1.2rem 1.1rem;
			}

			@container (min-width: 36rem) {
				.pg-body {
					display: grid;
					grid-template-columns: minmax(0, 56fr) 0.8rem minmax(0, 44fr);
					min-height: 22rem;
				}

				.pg-code {
					border-bottom: 0;
				}

				.pg-split {
					position: relative;
					display: block;
				}

				.pg-split::before {
					position: absolute;
					inset-block: 0;
					inset-inline-start: calc(50% - 1px);
					border-inline-start: 2px dashed var(--pg-band);
					content: '';
				}
			}

			.pg-panel-outer {
				display: block;
			}

			.pg-strip {
				position: absolute;
				top: calc(-1 * var(--pg-tab-h));
				left: var(--pg-tab-left);
				z-index: 2;
				display: flex;
				align-items: end;
				height: var(--pg-tab-h);
				margin: 0;
			}

			.pg-tab {
				position: relative;
				margin-block-end: -2px;
				padding: 0.25em 1.3em;
				border: 2px solid var(--ink);
				border-block-end: 0;
				border-radius: 22px 24px 5px 4px / 18px 20px 5px 4px;
				background: var(--pg-tab-back);
				color: color-mix(in oklch, var(--ink) 82%, var(--paper));
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.35;
				white-space: nowrap;
			}

			.pg-tab:hover {
				background: var(--pg-tab-back);
				color: var(--ink);
			}

			.pg-tab[ui-selected] {
				z-index: 1;
				padding: 0.25em 1.25em 0.3em;
				background: var(--paper);
				color: var(--ink);
				font-size: var(--step-1);
			}

			.pg-tab + .pg-tab {
				margin-inline-start: -0.3rem;
			}

			.pg-clamp {
				border: 0;
				border-radius: 0;
			}

			.pg-code-body {
				max-height: 22rem;
				overflow: auto;
			}

			.pg-shiki {
				counter-reset: pg-line;
				padding: 0.85rem 0.1rem 0.85rem 0;
				font-size: clamp(0.78rem, 2cqi, 1.15rem);
				overflow-x: visible;
			}

			.pg-shiki .pg-line {
				position: relative;
				padding-inline-start: 2.9rem;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				counter-increment: pg-line;
			}

			.pg-shiki .pg-line::before {
				position: absolute;
				inset-inline-start: 0;
				width: 2rem;
				color: var(--muted-ink);
				text-align: end;
				content: counter(pg-line);
			}

			.pg-fade,
			.pg-expand {
				display: none;
			}

			.pg-clamp[ui-closed] .pg-source-context {
				display: revert;
			}

			.pg-try {
				padding: 0.7rem 0 0.55rem 0.4rem;
				border-top: 2px dashed var(--pg-band);
			}

			.pg-try-title {
				display: block;
				margin-block-end: 0.3rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				font-weight: 700;
			}

			.pg .pg-controls {
				padding: 0;
				border: 0;
			}

			.pg-quick,
			.pg-rest {
				gap: 0.5em 1.6em;
			}

			.pg-rest {
				border-block-start: 0;
			}

			.pg-switch {
				height: 1.5em;
				border: 2px solid var(--ink);
				border-radius: 14px 18px 12px 16px;
				background: transparent;
			}

			.pg-switch[ui-checked] {
				background: var(--mark);
			}

			.pg-knob {
				width: 1.15em;
				height: 1.15em;
				margin: 0 0 0 0.1em;
				border: 2px solid var(--ink);
				border-radius: 50% 45% 55% 48%;
				box-shadow: none;
			}

			.pg-switch[ui-checked] .pg-knob {
				margin-inline-start: calc(100% - 1.3em);
			}

			.pg-pick-trigger,
			.pg-field {
				border: 2px solid var(--ink);
				border-radius: 10px 6px 12px 8px;
				background: transparent;
			}

			.pg-pick-list {
				border: 2px solid var(--ink);
				border-radius: 10px 6px 12px 8px;
				box-shadow: 2px 3px 0 var(--ink);
			}

			.pg-head .pg-bar-pick {
				grid-area: auto;
				margin: 0;
				padding: 0;
			}

			.pg-log {
				margin: 0.4rem 0 0 0.4rem;
			}

			@media (max-width: 600px) {
				.pg {
					--pg-bleed: calc(2 * var(--space-s-l));
					--pg-tab-left: calc(var(--space-s-l) + 0.4rem);
					--pg-inset: 0.6rem;
					padding-left: 1.5rem;
				}
			}`;

export const CHROME_CSS = `${CONTROLS_CSS}

${STAGE_CSS}

${CODE_CSS}

${NOTEBOOK_CSS}

${docCss('.pg')}`;

/** A standalone card: the playground's sticker round a stage and a code panel. */
export const CODE_PANEL_CSS = `${sticker('.cp')}

${STAGE_CSS}

${FOCUS_CSS}

${docCss('.cp')}`;
