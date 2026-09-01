// The generated card's own CSS, lifted from the hand-written
// `accordion-playground.tsrx` and the code panel and put behind one `pg-`
// namespace: the demo's authored CSS lands in the same scoped block, so a demo
// class named `panel` or `switch` must not collide with the chrome's.
export const CHROME_CSS = `			.pg {
				display: grid;
				margin-block: var(--space-s);
				border: 2px solid var(--code-edge);
				border-radius: 10px;
				background: var(--raised);
				overflow: clip;
			}

			.pg-controls {
				display: grid;
				gap: 0.5em;
				padding: 0.7em 0.9em;
				border-block-end: 2px solid var(--code-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em 1.1em;
				align-items: center;
			}

			.pg-rest {
				padding-block-start: 0.6em;
				border-block-start: 2px dashed var(--code-edge);
			}

			.pg-rest[ui-closed] {
				display: none;
			}

			.pg-cell {
				display: flex;
				gap: 0.4em;
				align-items: center;
			}

			.pg-ctl {
				display: flex;
				gap: 0.45em;
				align-items: center;
			}

			.pg-state {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
				opacity: 0.65;
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
				width: 2.4em;
				height: 1.3em;
				padding: 0.12em;
				border: 2px solid var(--ink);
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
				width: 0.95em;
				height: 0.95em;
				border-radius: 999px;
				background: var(--ink);
				transition: transform 130ms ease;
			}

			.pg-switch[ui-checked] .pg-knob {
				transform: translateX(1.1em);
			}

			.pg-field {
				min-width: 7em;
				padding: 0.2em 0.5em;
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
				display: grid;
				place-items: center;
				width: 1.15em;
				height: 1.15em;
				padding: 0;
				border: 2px solid var(--code-edge);
				border-radius: 999px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--2);
				line-height: 1;
				cursor: help;
			}

			.pg-tip {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 6;
				width: max-content;
				max-width: 14rem;
				margin-block-start: 0.3em;
				padding: 0.25em 0.55em;
				border-radius: 4px;
				background: var(--slab);
				color: var(--slab-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
			}

			.pg-tip[ui-closed] {
				display: none;
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

			.pg-showall[ui-open]::after {
				content: ' \\2304';
			}

			.pg-pick {
				position: relative;
			}

			.pg-pick-trigger {
				min-width: 6.5em;
				padding: 0.25em 0.6em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				text-align: start;
				cursor: pointer;
			}

			.pg-pick-list {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 5;
				min-width: 8em;
				margin-block-start: 0.25em;
				padding: 0.2em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
			}

			.pg-pick-list[ui-closed] {
				display: none;
			}

			.pg-pick-item {
				padding: 0.25em 0.5em;
				border-radius: 4px;
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

			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 15rem;
				padding: var(--space-s);
				background: var(--paper);
			}

			.pg-bar {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em 1em;
				justify-content: end;
				padding: 0.6em 0.9em;
				border-block-start: 2px solid var(--code-edge);
			}

			.pg-bar-pick {
				display: grid;
				gap: 0.2em;
				justify-items: start;
			}

			.pg-bar-name {
				font-size: var(--step--2);
				font-weight: 700;
				letter-spacing: 0.04em;
				color: var(--ink);
			}

			.pg-bar-trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				min-width: 8.5em;
			}

			.pg-bar-trigger::after {
				content: '\\2304';
			}

			/* The bar is the last row of a clipped container, so its list opens up. */
			.pg-bar-list {
				inset-block-start: auto;
				inset-block-end: 100%;
				margin-block: 0 0.25em;
			}

			.pg-code {
				border-block-start: 2px solid var(--code-edge);
				background: var(--code-surface);
			}

			.pg-panel {
				display: block;
				background: var(--raised);
				overflow: clip;
			}

			.pg-strip {
				padding: 0.35em 0.5em 0;
				border-block-end: 1px solid var(--code-edge);
			}

			.pg-strip-row {
				display: flex;
				gap: 0.2em;
			}

			.pg-tab {
				padding: 0.25em 0.75em;
				border: 0;
				border-radius: 6px 6px 0 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.6;
				cursor: pointer;
			}

			.pg-tab[ui-selected] {
				background: var(--paper);
				opacity: 1;
				font-weight: 700;
			}

			/* The clamp: the code always shows, and opening only lifts the ceiling. */
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
			}

			.pg-fade {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				background: linear-gradient(to bottom, transparent, var(--raised) 70%);
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

			@media (max-width: 866px) {
				.pg {
					border-inline: 0;
					border-radius: 0;
				}

				.pg-quick,
				.pg-rest {
					flex-direction: column;
					align-items: start;
				}

				.pg-showall {
					margin-inline-start: 0;
				}

				.pg-bar {
					justify-content: start;
				}
			}`;
