// A terminal in the repo: pnpm install points git at .githooks, and from then on git commit runs lint and CI's fast jobs first. Commit before installing and nothing is checked; leave an unused import and the commit stops with the fix.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { BARE, COMMIT, INSTALL, LINT_FAIL } from './terminal.ts';

export default function TerminalFigure() @{
	let hooks = state(false);
	let unused = state(false);
	let last = state('');
	let beat = state(0);
	let said = state('');
	const typed = computed(() => (last === 'install' ? 'pnpm install' : last === '' ? '' : 'git commit -m "Start the calendar week on Monday"'));
	const shown = (block: string) => (last === block ? (beat % 2 ? 'block on odd' : 'block on even') : 'block');
	const installClass = computed(() => shown('install'));
	const commitClass = computed(() => shown('commit'));
	const failClass = computed(() => shown('fail'));
	const bareClass = computed(() => shown('bare'));

	const install = () => {
		hooks = true;
		last = 'install';
		beat = beat + 1;
		said = 'pnpm install ran the prepare script: git config core.hooksPath .githooks.';
	};
	const commit = () => {
		beat = beat + 1;
		if (!hooks) {
			last = 'bare';
			said = 'Committed with no checks: git has no hooks until pnpm install sets core.hooksPath.';
			return;
		}
		if (unused) {
			last = 'fail';
			said = 'The pre-commit hook stopped the commit: vp lint failed. It printed the fix command.';
			return;
		}
		last = 'commit';
		said = 'The pre-commit hook ran lint, then the four fast jobs, and the commit went through.';
	};

	<figure
		class="terminal-toy"
		onKeyDown={(event) => {
			if (event.key !== 'Escape') return;
			hooks = false;
			unused = false;
			last = '';
			said = 'A fresh clone: no hooks yet.';
		}}
	>
		<InkScreen url="~/markless" tone="dark" label="A terminal in the markless repo">
			<div class="term">
				<p class="prompt">
					<span class="sigil">$</span> {typed}
					<span class="caret" aria-hidden="true">▍</span>
				</p>
				<div class={installClass}>
					@for (const line of INSTALL; key line) {
						<p class={line.startsWith('. prepare$') ? 'out key' : 'out'}>{line}</p>
					}
				</div>
				<div class={commitClass}>
					@for (const line of COMMIT; key line) {
						<p class={line.includes('passed') || line.startsWith('pass:') ? 'out ok' : 'out'}>{line}</p>
					}
				</div>
				<div class={failClass}>
					@for (const line of LINT_FAIL; key line) {
						<p class={line.startsWith('Fix with') ? 'out key' : 'out bad'}>{line}</p>
					}
				</div>
				<div class={bareClass}>
					@for (const line of BARE; key line) {
						<p class="out">{line}</p>
					}
					<p class="out quiet"># no hook ran: nothing was checked</p>
				</div>
				<div class="keys" role="group" aria-label="Commands">
					<InkButton onClick={() => install()}>pnpm install</InkButton>
					<InkButton alt onClick={() => commit()}>git commit</InkButton>
				</div>
			</div>
		</InkScreen>
		<label class="slip">
			<input
				type="checkbox"
				checked={unused}
				onChange={(event) => {
					unused = (event.target as HTMLInputElement).checked;
					said = unused ? 'calendar.tsrx now has an unused import.' : 'The unused import is gone.';
				}}
			/>
			<span>
				Leave an unused <code>import</code> in <code>calendar.tsrx</code>
			</span>
		</label>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.terminal-toy {
				margin: var(--space-m) 0;
			}

			.term {
				padding: 0.6rem 1rem 0.9rem;
				font-size: 0.86rem;
				line-height: 1.5;
				min-height: 13rem;
			}

			.prompt,
			.out {
				font-family: var(--font-mono);
			}

			.term p {
				margin: 0;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}

			.prompt {
				font-weight: 700;
			}

			.sigil {
				opacity: 0.6;
			}

			.caret {
				animation: blink 1s steps(1) infinite;
			}

			@keyframes blink {
				50% {
					opacity: 0;
				}
			}

			.block {
				display: none;
			}

			.block.on {
				display: block;
			}

			.out {
				border-radius: 4px;
				transition: background 160ms ease;
			}

			.out:hover {
				background: color-mix(in oklch, var(--yellow) 22%, transparent);
			}

			.on .out {
				animation: type-a 260ms ease-out both;
			}

			.on.even .out {
				animation-name: type-b;
			}

			.on .out:nth-child(2) {
				animation-delay: 180ms;
			}

			.on .out:nth-child(3) {
				animation-delay: 360ms;
			}

			.on .out:nth-child(4) {
				animation-delay: 540ms;
			}

			.on .out:nth-child(5) {
				animation-delay: 720ms;
			}

			.on .out:nth-child(6) {
				animation-delay: 900ms;
			}

			.on .out:nth-child(7) {
				animation-delay: 1080ms;
			}

			@keyframes type-a {
				from {
					opacity: 0;
					transform: translateY(3px);
				}
			}

			@keyframes type-b {
				from {
					opacity: 0;
					transform: translateY(3px);
				}
			}

			.key {
				background: color-mix(in oklch, var(--yellow) 30%, transparent);
			}

			.ok {
				opacity: 0.85;
			}

			.bad {
				color: color-mix(in oklch, #cb2431 70%, var(--screen-ink));
				font-weight: 700;
			}

			.quiet {
				opacity: 0.55;
				font-style: italic;
			}

			.keys {
				display: flex;
				flex-wrap: wrap;
				gap: 0.6rem;
				margin-top: 0.9rem;
				font-family: var(--font-mono);
			}

			.slip {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0 0 0 0.4rem;
				font-size: 0.95rem;
				cursor: pointer;
			}

			.slip input {
				accent-color: var(--ink);
				width: 1.05rem;
				height: 1.05rem;
			}

			@media (prefers-reduced-motion: reduce) {
				.terminal-toy * {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
