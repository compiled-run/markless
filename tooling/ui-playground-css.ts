function accent(card: string): string {
	return `			${card} {
				--pg-accent: var(--pink);
			}

			html[data-theme='dark'] ${card} {
				--pg-accent: color-mix(in oklch, var(--pink) 60%, transparent);
			}`;
}

function sticker(card: string): string {
	return `			${card} {
				position: relative;
				display: grid;

				grid-template-columns: minmax(0, 1fr);
				margin-block: var(--space-m);
				border: 2px solid var(--ink);
				border-radius: 8px;
				background: var(--raised);
				box-shadow: 4px 4px 0 var(--pg-accent);
				overflow: clip;
			}

${accent(card)}


			@media (max-width: 866px) {
				${card} {
					margin-inline: calc(-1 * var(--space-s-l));
					border-inline: 0;
					border-radius: 0;
					box-shadow: 0 4px 0 var(--pg-accent);
				}
			}`;
}

function tipLook(tip: string): string {
	return `			${tip} {
				z-index: 40;
				width: max-content;
				max-width: min(36ch, calc(100vw - 2rem));
				margin: 0 .5rem;
				padding: 0.15em 0;
				border: 1.5px solid #202023;
				border-radius: 6px;
				background: #fffdf7;
				box-shadow: 3px 4px 0 var(--pg-tip-accent, #e6c4fb);
				color: #202023;
				font-family: system-ui, sans-serif;
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
				font-family: system-ui, sans-serif;
				padding: 0 0.75em 0.5em;
			}

			${tip} .tsrx-tip-body:empty {
				display: none;
			}

			${tip} .tsrx-tip-type {
				padding: 0.4em 0.75em;
				border-block-start: 1px solid #d8d3dd;
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.8;
			}`;
}

function anchored(anchor: string, area: string): string {
	return `position: fixed;
				inset: auto;
				position-anchor: ${anchor};
				position-area: ${area};
				position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;`;
}

const PICK_CSS = `			.pg-pick-trigger {
				display: flex;
				gap: 0.7em;
				align-items: center;
				justify-content: space-between;
				min-width: 6.5em;
				padding: 0.3em 0.7em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
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
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				box-shadow: 3px 3px 0 var(--pg-accent);
			}

			.pg-pick-list:is([ui-closed], [hidden]) {
				display: none;
			}


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
				font-family: var(--font-mono);
				font-size: var(--step--1);
				cursor: pointer;
			}

			.pg-pick-item:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.pg-pick-item[ui-selected] {
				background: var(--tinted);
			}`;

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
				background: var(--yellow);
			}

			.pg-switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}


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
				gap: 0.2em;
				margin-inline-start: auto;
				padding: 0.2em 0.4em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
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

export const STAGE_CSS = `			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 18rem;
				margin: var(--space-s);
				padding: var(--space-m) var(--space-s);
				border: 1px solid var(--code-edge);
				border-radius: 6px;
				background: var(--code-surface);
			}`;

export const CODE_CSS = `
			.pg-bar {
				display: flex;

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


			.pg-strip {
				position: relative;
				z-index: 1;
				margin-block-end: -1px;
				padding: 0;
			}

			.pg-strip-row {
				display: flex;
				gap: 0.25em;
				align-items: flex-end;
			}


			.pg-tab {
				padding: 0.45em 0.9em;
				border: 1px solid transparent;
				border-block-end: 0;
				border-radius: 6px 6px 0 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1.3;
				opacity: 0.6;
				cursor: pointer;
			}

			.pg-tab:hover {
				opacity: 0.85;
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

			.pg-pane[hidden] {
				display: none;
			}


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
				padding: var(--space-s);
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1.6;
				tab-size: 2;
				overflow-x: auto;
			}

			.pg-line {
				display: block;
				white-space: pre;

				min-height: 1lh;
			}

			.pg-fade {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5.5rem;
				background: linear-gradient(to bottom, transparent, var(--code-surface) 75%);
				pointer-events: none;
			}


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
`;

export function docCss(root: string): string {
	return `
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

const DESIGN_CSS = `
.pg,
.cp {
	position: relative;
	z-index: 2;
	min-width: 0;
	margin: 2rem 0;
	gap: 0;
	border: 2px solid #202023;
	border-radius: 10px;
	overflow: visible;
	background: var(--code-surface);
	box-shadow: 5px 5px 0 #ffe05d;
	--pg-band: #fff0a7;
	--pg-bar-fill: #fffdf7;
	--pg-tab-fill: #ffd0e7;
	--pg-marker: #f34c99;
	--pg-tip-accent: #f6abd4;
	--pg-code-fill: #fff;
}
html[data-variant='b'] .pg,
html[data-variant='b'] .cp {
	--pg-band: #e9d9fc;
	--pg-bar-fill: #e9d9fc;
	--pg-tab-fill: #f7a5d1;
	--pg-tip-accent: #ffe05d;
	box-shadow: none;
}
html[data-variant='c'] .pg,
html[data-variant='c'] .cp {
	--pg-band: #faf7f0;
	--pg-bar-fill: #faf7f0;
	--pg-tab-fill: #ffe768;
	--pg-tip-accent: #d6bbfc;
	--pg-marker: #ffe768;
	--pg-code-fill: #fcfaf5;
	border-width: 1.5px;
	border-radius: 7px;
	box-shadow: -6px 0 0 #f7a6cf;
}
html[data-variant='d'] .pg,
html[data-variant='d'] .cp {
	--pg-band: #fff5cf;
	--pg-bar-fill: #eee2fb;
	--pg-tab-fill: transparent;
	--pg-marker: #57cb83;
	--pg-tip-accent: #ffe05d;
	--pg-code-fill: #fcfaf5;
	box-shadow: none;
}
.pg-controls {
	padding: 0;
	gap: 0;
	background: var(--pg-band);
	color: #202023;
	border-radius: 8px 8px 0 0;
	border-bottom: 1px solid #202023;
}
.pg-quick {
	padding: 1rem 1.25rem;
	gap: 0.75rem 1.3rem;
}
.pg-title {
	font:
		700 1.3rem/1.2 'Joy Elia',
		system-ui,
		sans-serif;
	margin-right: auto;
}
html[data-variant='a'] .pg-title::before {
	content: '♛';
	margin-right: 0.5rem;
	font-size: 1.6rem;
}
html[data-variant='b'] .pg-title {
	text-shadow: 0 3px #ffe05d;
}
html[data-variant='c'] .pg-title {
	text-decoration: underline #f7a6cf 4px;
	text-underline-offset: 5px;
}
.pg-rest {
	padding: 1rem 1.25rem;
	border-top: 1px solid #c7bdcc;
}
.pg-name {
	font:
		500 0.95rem/1.35 system-ui,
		sans-serif;
	color: #202023;
}
.pg-showall {
	color: #202023;
	font:
		500 0.95rem/1.35 system-ui,
		sans-serif;
}
.pg-dot {
	color: #202023;
	opacity: 1;
	width: 1.5rem;
	height: 1.5rem;
}
.pg-switch {
	width: 2.7rem;
	height: 1.5rem;
	border: 1.5px solid #202023;
	background: #e5e5e7;
	padding: 1px;
}
.pg-knob {
	width: 1.15rem;
	height: 1.15rem;
	background: #fff;
	box-shadow: 0 0 0 1px #747477;
}
.pg-switch[ui-checked] {
	background: #45b773;
}
.pg-switch[ui-checked] .pg-knob {
	margin-inline-start: calc(100% - 1.15rem);
}
html[data-variant='b'] .pg-switch[ui-checked] {
	background: #b785ef;
}
.pg-stage {
	--ink: #202023;
	--paper: #fff;
	--raised: #fff;
	--code-edge: #c8c8cd;
	--tinted-quiet: #f6f2fa;
	color: #202023;
	color-scheme: light;
	background: #fff;
	background-image: none;
	margin: 0;
	padding: 2rem 2.5rem;
	min-width: 0;
	min-height: 18rem;
	border: 0;
	border-radius: 0;
	box-sizing: border-box;
	font-family: system-ui, sans-serif;
}
.pg[data-family='accordion'] .pg-stage {
	padding: 0;
	min-height: 0;
}
.pg-log {
	background: var(--pg-band);
	color: #202023;
	padding: 0.5rem 1.25rem;
}
.pg-code {
	border-top: 1px solid #202023;
	border-radius: 0 0 8px 8px;
	min-width: 0;
}
.pg-panel {
	overflow: visible;
}
.pg-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem 0;
	background: var(--pg-bar-fill);
	color: #202023;
}
.pg-strip {
	min-width: 0;
	margin: 0;
}
.pg-strip-row {
	gap: 0;
	align-items: stretch;
}
.pg-tab {
	position: relative;
	padding: 0.8rem 1.2rem;
	min-height: 3rem;
	font:
		500 1rem/1.2 system-ui,
		sans-serif;
	color: #202023;
	opacity: 1;
	border: 1px solid transparent;
	border-bottom: 0;
}
.pg-tab[ui-selected] {
	background: var(--pg-tab-fill);
	border-color: #202023;
	font-weight: 700;
}
.pg-tab[ui-selected]::after {
	content: '';
	position: absolute;
	height: 4px;
	bottom: 4px;
	left: 0.65rem;
	right: 0.65rem;
	background: var(--pg-marker);
	border-radius: 40%;
	transform: rotate(-1deg);
}
.pg-tab:focus-visible,
.pg-dot:focus-visible,
.pg-showall:focus-visible {
	outline: 2px dashed #202023;
	outline-offset: -3px;
}
html[data-variant='b'] .pg-tab[ui-selected] {
	clip-path: polygon(15% 0, 85% 0, 100% 100%, 0 100%);
	border: 0;
	padding-inline: 1.8rem;
}
html[data-variant='c'] .pg-tab,
html[data-variant='d'] .pg-tab {
	border-radius: 0;
	border: 0;
	border-right: 1px solid #c8bcd4;
}
html[data-variant='c'] .pg-tab[ui-selected] {
	background: #ffe768;
}
html[data-variant='d'] .pg-tab[ui-selected] {
	background: #e0c8f5;
}
.pg-bar-pick {
	display: flex;
	margin: 0 0 0.5rem auto;
	padding: 0;
}
.pg-bar-name {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}
.pg-bar-trigger {
	width: 10rem;
	min-width: 0;
	font-size: 0.95rem;
}
.pg-bar-list {
	color: var(--ink);
	min-width: 12rem;
	z-index: 45;
}
.pg-panes {
	border-top: 1px solid #202023;
	border-radius: 0 0 8px 8px;
}
.pg-clamp {
	background: var(--pg-code-fill);
}
.pg-code-body {
	max-height: 20rem;
	overflow: auto;
	background: var(--pg-code-fill);
}
.pg-clamp[ui-open] .pg-code-body {
	max-height: none;
}
.pg-shiki {
	--ink: #202023;
	color-scheme: light;
	background: var(--pg-code-fill);
	color: #202023;
	font-size: 0.85rem;
	line-height: 1.65;
	padding: 1.1rem 1.25rem;
}
.pg-shiki,
.pg-shiki span {
	font-family: var(--font-mono);
}
.pg-fade {
	display: none;
}
.pg-expand {
	width: 100%;
	box-sizing: border-box;
	position: relative;
	height: auto;
	padding: 0.65rem;
	border-top: 1px solid var(--code-edge);
	background: var(--pg-code-fill);
	color: #202023;
	border-radius: 0 0 8px 8px;
	font:
		600 0.9rem/1.2 system-ui,
		sans-serif;
}
.pg-tip,
.cp-doc {
	font-family: system-ui, sans-serif;
}
.pg::after {
	content: '☆';
	position: absolute;
	right: -0.5rem;
	top: -1.55rem;
	color: #62cf89;
	font: 700 2.5rem/1 system-ui;
	pointer-events: none;
	transform: rotate(10deg);
}
html[data-variant='b'] .pg::after {
	top: -2rem;
	bottom: auto;
	right: 1rem;
}
html[data-variant='c'] .pg::after {
	color: #ba84e9;
	font-size: 1.8rem;
}
html[data-variant='d'] .pg::after {
	content: '♛';
	color: #202023;
	text-shadow: 2px 2px #ffe05d;
}
@media (max-width: 866px) {
	.pg,
	.cp {
		margin: 1.5rem 0;
		border: 1.5px solid #202023;
		border-radius: 7px;
	}
	.pg-quick,
	.pg-rest {
		flex-flow: row wrap;
		align-items: center;
		padding: 0.85rem;
		gap: 0.75rem;
	}
	.pg-title {
		flex-basis: 100%;
	}
	.pg-cell {
		width: auto;
	}
	.pg-showall {
		margin: 0;
	}
	.pg-stage {
		padding: 1.5rem 1rem;
	}
	.pg-bar {
		padding: 0.4rem 0.5rem 0;
	}
	.pg-bar-pick {
		margin-left: auto;
	}
	.pg-bar-trigger {
		width: 7rem;
		font-size: 0.85rem;
	}
	.pg-tab {
		font-size: 0.9rem;
		padding: 0.8rem 0.65rem;
	}
	html[data-variant='b'] .pg-tab[ui-selected] {
		padding-inline: 0.9rem;
	}
	.pg-shiki {
		font-size: 0.75rem;
		padding: 0.85rem;
	}
}
`;

export const CHROME_CSS = `${CONTROLS_CSS}

${STAGE_CSS}

${CODE_CSS}

${docCss('.pg')}
${DESIGN_CSS}`;

export const CODE_PANEL_CSS = `${sticker('.cp')}

${STAGE_CSS}

${FOCUS_CSS}

${docCss('.cp')}
${DESIGN_CSS}`;
