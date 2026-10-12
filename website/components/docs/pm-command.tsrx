import { storage } from '@markless/core';
import { tabs } from '@markless/ui';

type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun';

// One paper index tab, stretched to each label: the fill, a two-run inked outline that overshoots the strip, and a short retrace along the top.
const TAB = {
	fill: 'M1.2 41 C1.6 27 2.2 14 4.4 7.2 C5.6 3.4 8.6 1.8 14 1.5 L86 1 C92 1.2 95 2.8 96.2 6.6 C98.2 13 98.8 27 99.2 41 Z',
	line: 'M1.4 42 C1.7 29 2.1 15 4.3 7.6 C5.5 3.6 8.4 2 14.5 1.6 C38 1.2 62 1.6 84 0.9 M83 1.2 C91.5 1 95 2.6 96.3 6.8 C98.1 13.5 98.7 28 99.1 42',
	retrace: 'M9 3.4 C24 2.6 40 3.1 58 2.6',
} as const;

function commandFor(manager: Manager, kind: 'add' | 'dev-add' | 'run' | 'create', args: string): string {
	if (kind === 'add') return (manager === 'npm' ? 'npm install ' : manager + ' add ') + args;
	if (kind === 'dev-add') return (manager === 'npm' ? 'npm install -D ' : manager + (manager === 'bun' ? ' add -d ' : ' add -D ')) + args;
	if (kind === 'run') return (manager === 'npm' || manager === 'bun' ? manager + ' run ' : manager + ' ') + args;
	return manager === 'yarn' ? 'yarn create ' + args.replace(/@latest$/, '') : manager + ' create ' + args;
}

/** One shell command, shown for npm, pnpm, yarn and bun on tabs. */
export default function PmCommand({
	add,
	devAdd,
	run,
	create,
}: {
	/** Packages to install, e.g. `@markless/core vite`. */
	readonly add?: string;
	/** Packages to install as dev dependencies. */
	readonly devAdd?: string;
	/** A package.json script name, e.g. `dev`. */
	readonly run?: string;
	/** A create-* starter, e.g. `markless@latest`. */
	readonly create?: string;
}) @{
	const kind = add ? 'add' : devAdd ? 'dev-add' : run ? 'run' : 'create';
	const args = add ?? devAdd ?? run ?? create ?? '';
	let manager = storage('pm-manager', 'npm');

	<tabs.root
		class="pm"
		value={manager}
		onChange={(next: string) => {
			manager = next;
		}}
	>
		<tabs.list class="pm-strip" aria-label="Package manager">
			<div class="pm-row" role="presentation">
				<tabs.trigger class="pm-tab" value="npm">
					<svg class="pm-ink" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
						<path class="pm-fill" d={TAB.fill} />
						<path class="pm-line" d={TAB.line} />
						<path class="pm-line pm-retrace" d={TAB.retrace} />
					</svg>
					<span class="pm-name">npm</span>
				</tabs.trigger>
				<tabs.trigger class="pm-tab" value="pnpm">
					<svg class="pm-ink" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
						<path class="pm-fill" d={TAB.fill} />
						<path class="pm-line" d={TAB.line} />
						<path class="pm-line pm-retrace" d={TAB.retrace} />
					</svg>
					<span class="pm-name">pnpm</span>
				</tabs.trigger>
				<tabs.trigger class="pm-tab" value="yarn">
					<svg class="pm-ink" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
						<path class="pm-fill" d={TAB.fill} />
						<path class="pm-line" d={TAB.line} />
						<path class="pm-line pm-retrace" d={TAB.retrace} />
					</svg>
					<span class="pm-name">yarn</span>
				</tabs.trigger>
				<tabs.trigger class="pm-tab" value="bun">
					<svg class="pm-ink" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
						<path class="pm-fill" d={TAB.fill} />
						<path class="pm-line" d={TAB.line} />
						<path class="pm-line pm-retrace" d={TAB.retrace} />
					</svg>
					<span class="pm-name">bun</span>
				</tabs.trigger>
			</div>
		</tabs.list>
		<div
			class="torn-strip"
			onVisible={() => {
				const saved = manager;
				manager = saved;
			}}
		>
			<span class="torn-art" aria-hidden="true">
				<span class="torn-cast"><span class="torn-below"></span><span class="torn-beside"></span><span class="torn-corner"></span></span>
				<span class="torn-middle"></span><span class="torn-band torn-upper"></span><span class="torn-band torn-lower"></span>
				<span class="torn-ends"></span>
			</span>
			<tabs.content class="pm-pane" value="npm">
				<pre class="shiki"><code><span class="pm-prompt" aria-hidden="true">$ </span>{commandFor('npm', kind, args)}</code></pre>
			</tabs.content>
			<tabs.content class="pm-pane" value="pnpm">
				<pre class="shiki"><code><span class="pm-prompt" aria-hidden="true">$ </span>{commandFor('pnpm', kind, args)}</code></pre>
			</tabs.content>
			<tabs.content class="pm-pane" value="yarn">
				<pre class="shiki"><code><span class="pm-prompt" aria-hidden="true">$ </span>{commandFor('yarn', kind, args)}</code></pre>
			</tabs.content>
			<tabs.content class="pm-pane" value="bun">
				<pre class="shiki"><code><span class="pm-prompt" aria-hidden="true">$ </span>{commandFor('bun', kind, args)}</code></pre>
			</tabs.content>
		</div>
		<style>
			.pm {
				margin-block: var(--space-m) var(--space-l);
			}

			.pm .torn-strip {
				margin-block: 0;
			}

			.pm-row {
				--tab-paper: color-mix(in oklch, var(--paper) 35%, white);
				display: flex;
				align-items: flex-end;
				gap: 0.3rem;
				padding-inline: 0.9rem;
				margin-block-end: -2px;
				position: relative;
				z-index: 1;

				html.dark & {
					--tab-paper: color-mix(in oklch, var(--paper) 88%, var(--ink));
				}
			}

			.pm-tab {
				position: relative;
				isolation: isolate;
				padding: 0.3em 1em 0.4em;
				border: 0;
				background: none;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--1);
				font-weight: 600;
				line-height: 1.2;
				cursor: pointer;
				rotate: -1.4deg;
				transform-origin: 50% 100%;
				transition: padding-top 160ms ease-out;
			}

			.pm-tab:nth-child(2) {
				rotate: 0.9deg;
			}

			.pm-tab:nth-child(3) {
				rotate: -0.6deg;
			}

			.pm-tab:nth-child(4) {
				rotate: 1.3deg;
			}

			.pm-tab::after {
				content: '';
				position: absolute;
				inset: 4px -5px -1px 5px;
				z-index: -2;
				border-radius: 9px 8px 0 0;
				background: repeating-linear-gradient(-58deg, var(--ink) 0 0.8px, transparent 0.8px 3px);
				opacity: 0.4;
			}

			.pm-ink {
				position: absolute;
				inset: 0;
				z-index: -1;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.pm-fill {
				fill: var(--tab-paper);
			}

			.pm-line {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.5;
				stroke-linecap: round;
				vector-effect: non-scaling-stroke;
			}

			.pm-retrace {
				stroke-width: 0.8;
				opacity: 0.6;
			}

			.pm-name {
				position: relative;
			}

			.pm-tab[ui-selected] {
				padding-top: 0.65em;
				color: var(--paper);
				font-weight: 800;
			}

			.pm-tab[ui-selected] .pm-fill {
				fill: var(--ink);
			}

			.pm-tab:not([ui-selected]):hover .pm-fill {
				fill: color-mix(in oklch, var(--tab-paper) 80%, var(--yellow));
			}

			.pm-tab:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 3px;
				border-radius: 6px;
			}

			@media (prefers-reduced-motion: reduce) {
				.pm-tab {
					transition: none;
				}
			}

			.pm-pane pre {
				position: relative;
				margin: 0;
				border: 0;
				border-radius: 0;
				background: transparent;
				padding: 1.1rem 1.3rem 1.9rem;
			}

			.pm-prompt {
				opacity: 0.45;
				user-select: none;
			}
		</style>
	</tabs.root>
}
