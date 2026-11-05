// The repo's own files: edit .ruler/AGENTS.md and run pnpm rules, and AGENTS.md and CLAUDE.md follow; edit AGENTS.md by hand and the agent-files check goes red until pnpm rules writes over it.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { CI_ERROR, HAND_LINE, RULE_LINE } from './explorer.ts';

export default function ExplorerFigure() @{
	let rule = state(false);
	let synced = state(false);
	let hand = state(false);
	let beat = state(0);
	let said = state('');
	const red = computed(() => hand || rule !== synced);
	const check = computed(() => (red ? 'check red' : 'check green'));
	const checkWord = computed(() => (red ? 'failed' : 'passed'));
	const sourceLine = computed(() => (rule ? 'diff add on' : 'diff add'));
	const outLine = computed(() => (synced ? (beat % 2 ? 'diff add on odd' : 'diff add on even') : 'diff add'));
	const handLine = computed(() => (hand ? 'diff hand on' : 'diff hand'));
	const sourceMark = computed(() => (rule ? 'mark on' : 'mark'));
	const agentsMark = computed(() => (hand || synced ? 'mark on' : 'mark'));
	const claudeMark = computed(() => (synced ? 'mark on' : 'mark'));

	const editSource = () => {
		rule = !rule;
		said = rule ? '.ruler/AGENTS.md has a new rule. AGENTS.md and CLAUDE.md do not, yet: agent-files would fail.' : 'The new rule is gone from .ruler/AGENTS.md.';
	};
	const editByHand = () => {
		hand = true;
		said = 'AGENTS.md was edited by hand. The agent-files check fails: it no longer matches .ruler/.';
	};
	const runRules = () => {
		synced = rule;
		hand = false;
		beat = beat + 1;
		said = 'pnpm rules wrote AGENTS.md and CLAUDE.md from .ruler/, over any hand edit. agent-files passes.';
	};

	<figure
		class="explorer-toy"
		onKeyDown={(event) => {
			if (event.key !== 'Escape') return;
			rule = false;
			synced = false;
			hand = false;
			said = 'Back to a clean checkout.';
		}}
	>
		<InkScreen url="markless/" label="The repo's files">
			<div class="tree">
				<p class="row dir">▾ .ruler/</p>
				<button type="button" class="row file editable" onClick={() => editSource()}>
					<span class="name">AGENTS.md</span>
					<span class={sourceMark}>M</span>
					<span class="hint">edit</span>
				</button>
				<p class={sourceLine}>{RULE_LINE}</p>
				<p class="row file">claude.md</p>
				<p class="row file">ruler.toml</p>
				<p class="row dir sub">▸ skills/</p>
				<p class="row dir">▾ specs/</p>
				<p class="row file">framework-design.md</p>
				<p class="row dir sub">▸ framework/</p>
				<button type="button" class="row file editable top" onClick={() => editByHand()}>
					<span class="name">AGENTS.md</span>
					<span class={agentsMark}>M</span>
					<span class="hint">edit by hand</span>
				</button>
				<p class={outLine}>{RULE_LINE}</p>
				<p class={handLine}>{HAND_LINE}</p>
				<p class="row file top">
					<span class="name">CLAUDE.md</span>
					<span class={claudeMark}>M</span>
				</p>
				<p class={outLine}>{RULE_LINE}</p>
			</div>
		</InkScreen>
		<div class="side">
			<InkButton onClick={() => runRules()}>pnpm rules</InkButton>
			<p class={check}>
				<span class="dot" aria-hidden="true"></span>
				<code>agent-files</code> {checkWord}
			</p>
			<p class={red ? 'ci-error on' : 'ci-error'}>{CI_ERROR}</p>
		</div>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.explorer-toy {
				display: grid;
				gap: 0.2rem 1rem;
				margin: var(--space-m) 0;
				container-type: inline-size;

				@container (min-width: 600px) {
					grid-template-columns: minmax(0, 1fr) 13rem;
					align-items: start;
				}
			}

			.tree {
				padding: 0.5rem 1rem 0.8rem;
			}

			.row,
			.diff,
			.name,
			.check,
			.ci-error {
				font-family: var(--font-mono);
			}

			.row,
			.diff {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0;
				padding: 0.08rem 0.4rem 0.08rem 1.5rem;
				font-size: 0.9rem;
				line-height: 1.55;
			}

			.dir {
				padding-left: 0.4rem;
				font-weight: 700;
			}

			.dir.sub {
				padding-left: 1.5rem;
				font-weight: 500;
			}

			.top {
				padding-left: 0.4rem;
			}

			button.row {
				width: 100%;
				border: 0;
				border-radius: 6px;
				background: none;
				color: inherit;
				text-align: left;
				cursor: pointer;
				transition: background 160ms ease, transform 160ms ease;
			}

			button.row:hover,
			button.row:focus-visible {
				background: color-mix(in oklch, var(--yellow) 30%, transparent);
				transform: translateX(3px);
			}

			button.row:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 1px;
			}

			.hint {
				margin-left: auto;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.8rem;
				letter-spacing: 0.06em;
				opacity: 0;
				transition: opacity 160ms ease;
			}

			button.row:hover .hint,
			button.row:focus-visible .hint {
				opacity: 0.8;
			}

			.mark {
				font-weight: 800;
				color: oklch(55% 0.13 70);
				opacity: 0;
			}

			.mark.on {
				opacity: 1;
			}

			.diff {
				display: none;
				padding-left: 2.6rem;
				font-size: 0.85rem;
			}

			.diff.on {
				display: flex;
			}

			.add {
				background: color-mix(in oklch, var(--yellow) 28%, transparent);
			}

			.add.on.odd {
				animation: ink-a 420ms ease-out both;
			}

			.add.on.even {
				animation: ink-b 420ms ease-out both;
			}

			@keyframes ink-a {
				from {
					opacity: 0;
				}
			}

			@keyframes ink-b {
				from {
					opacity: 0;
				}
			}

			.hand {
				color: #cb2431;
				text-decoration: underline wavy #cb2431;
				text-underline-offset: 3px;
			}

			.side {
				display: grid;
				gap: 0.6rem;
				justify-items: start;
				padding-top: 0.6rem;
			}

			.check {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0;
				font-size: 0.95rem;
			}

			.dot {
				width: 0.8rem;
				height: 0.8rem;
				border: 2px solid var(--ink);
				border-radius: 50%;
				transition: background 200ms ease;
			}

			.green .dot {
				background: color-mix(in oklch, oklch(70% 0.13 150) 80%, var(--paper));
			}

			.red .dot {
				background: #cb2431;
			}

			.red {
				color: #cb2431;
				font-weight: 700;
				animation: shake 360ms ease-in-out;
			}

			@keyframes shake {
				25% {
					transform: translateX(-3px);
				}
				75% {
					transform: translateX(3px);
				}
			}

			.ci-error {
				display: none;
				margin: 0;
				font-size: 0.8rem;
				line-height: 1.45;
				opacity: 0.85;
			}

			.ci-error.on {
				display: block;
			}

			@media (prefers-reduced-motion: reduce) {
				.explorer-toy * {
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
