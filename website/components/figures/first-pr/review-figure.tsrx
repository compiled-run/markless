// A pull request's conversation drawn in ink: fix or answer each review finding and it resolves; press merge while one is open and the button points at it instead.
import { computed, state } from '@markless/core';
import InkScreen from '../ink/ink-screen.tsrx';
import { BRANCH, FINDINGS, TITLE } from './review.ts';

export default function ReviewFigure() @{
	let done0 = state('');
	let done1 = state('');
	let blocked = state(-1);
	let beat = state(0);
	let queued = state(false);
	let said = state('');
	const open = computed(() => (done0 === '' ? 0 : done1 === '' ? 1 : -1));
	const card0 = computed(() => (done0 !== '' ? 'finding done' : blocked === 0 ? (beat % 2 ? 'finding open nudge-a' : 'finding open nudge-b') : 'finding open'));
	const card1 = computed(() => (done1 !== '' ? 'finding done' : blocked === 1 ? (beat % 2 ? 'finding open nudge-a' : 'finding open nudge-b') : 'finding open'));
	const mergeClass = computed(() => (queued ? 'merge queued' : open >= 0 ? 'merge waiting' : 'merge ready'));
	const mergeNote = computed(() => (queued ? 'In the merge queue' : open >= 0 ? (open === 0 && done1 === '' ? '2 conversations' : '1 conversation') + ' to answer' : 'Every finding has an answer'));
	const point = computed(() => (blocked >= 0 && open >= 0 ? (open === 0 ? 'pointer at-0 on' : 'pointer at-1 on') : 'pointer'));

	const answer = (i: number, how: string) => {
		if (i === 0) done0 = how;
		else done1 = how;
		blocked = -1;
		said = FINDINGS[i]!.who + "'s finding is resolved: " + (how === 'fix' ? 'you pushed a fix.' : 'you replied with your reason.');
	};
	const merge = () => {
		if (open >= 0) {
			blocked = open;
			beat = beat + 1;
			said = 'Not yet: ' + FINDINGS[open]!.who + "'s finding has no answer.";
			return;
		}
		queued = true;
		said = 'Every finding has an answer. The pull request joined the merge queue.';
	};

	<figure
		class="review-toy"
		onKeyDown={(event) => {
			if (event.key !== 'Escape') return;
			done0 = '';
			done1 = '';
			blocked = -1;
			queued = false;
			said = 'Both findings are open again.';
		}}
	>
		<InkScreen url="github.com/compiled-run/markless/pull/…" label="A pull request's conversation">
			<div class="pr">
				<p class="title">{TITLE}</p>
				<p class="chips">
					<span class="chip">{BRANCH}</span>
					<span class="into">into</span>
					<span class="chip">main</span>
				</p>
				<div class={card0}>
					<p class="who">
						<span class="avatar">{FINDINGS[0]!.who.slice(0, 1)}</span>
						<strong>{FINDINGS[0]!.who}</strong> on <span class="file">{FINDINGS[0]!.file}</span>
						<span class="badge">{done0 === 'fix' ? 'fixed' : done0 === 'reply' ? 'answered' : ''}</span>
					</p>
					<p class="body">{FINDINGS[0]!.text}</p>
					<p class="actions">
						<button type="button" class="act" onClick={() => answer(0, 'fix')}>Fix it</button>
						<button type="button" class="act" onClick={() => answer(0, 'reply')}>Reply with a reason</button>
					</p>
				</div>
				<div class={card1}>
					<p class="who">
						<span class="avatar">{FINDINGS[1]!.who.slice(0, 1)}</span>
						<strong>{FINDINGS[1]!.who}</strong> on <span class="file">{FINDINGS[1]!.file}</span>
						<span class="badge">{done1 === 'fix' ? 'fixed' : done1 === 'reply' ? 'answered' : ''}</span>
					</p>
					<p class="body">{FINDINGS[1]!.text}</p>
					<p class="actions">
						<button type="button" class="act" onClick={() => answer(1, 'fix')}>Fix it</button>
						<button type="button" class="act" onClick={() => answer(1, 'reply')}>Reply with a reason</button>
					</p>
				</div>
				<div class={mergeClass}>
					<p class="state">{mergeNote}</p>
					<button type="button" class="merge-button" onClick={() => merge()}>
						Merge when ready
					</button>
					<span class={point} aria-hidden="true">↑ answer this first</span>
				</div>
			</div>
		</InkScreen>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.review-toy {
				margin: var(--space-m) 0;
			}

			.pr {
				display: grid;
				gap: 0.6rem;
				padding: 0.6rem 1rem 1rem;
				position: relative;
			}

			.pr p {
				margin: 0;
			}

			.title {
				font-size: 1.15rem;
				font-weight: 700;
			}

			.chips {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.4rem;
				font-size: 0.85rem;
			}

			.chip,
			.file {
				font-family: var(--font-mono);
			}

			.chip {
				padding: 0.05rem 0.45rem;
				border: 1.5px solid currentColor;
				border-radius: 999px 900px 999px 950px;
				font-size: 0.8rem;
			}

			.into {
				opacity: 0.65;
			}

			.finding {
				display: grid;
				gap: 0.35rem;
				padding: 0.55rem 0.75rem;
				border: 1.5px solid currentColor;
				border-radius: 10px 14px 9px 12px;
				transition: box-shadow 160ms ease, opacity 220ms ease;
			}

			.finding.open:hover {
				box-shadow: 3px 4px 0 color-mix(in oklch, currentColor 25%, transparent);
			}

			.finding.done {
				opacity: 0.55;
			}

			.finding.done .body,
			.finding.done .actions {
				display: none;
			}

			.nudge-a {
				animation: nudge-a 420ms ease-in-out;
				background: color-mix(in oklch, var(--yellow) 30%, transparent);
			}

			.nudge-b {
				animation: nudge-b 420ms ease-in-out;
				background: color-mix(in oklch, var(--yellow) 30%, transparent);
			}

			@keyframes nudge-a {
				25% {
					transform: translateX(-4px);
				}
				75% {
					transform: translateX(4px);
				}
			}

			@keyframes nudge-b {
				25% {
					transform: translateX(-4px);
				}
				75% {
					transform: translateX(4px);
				}
			}

			.who {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.4rem;
				font-size: 0.9rem;
			}

			.avatar {
				display: inline-grid;
				place-items: center;
				width: 1.4rem;
				height: 1.4rem;
				border: 1.5px solid currentColor;
				border-radius: 50%;
				font-size: 0.75rem;
				font-weight: 700;
				line-height: 1;
			}

			.badge {
				margin-left: auto;
				font-family: 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.08em;
				font-size: 0.85rem;
			}

			.body {
				font-size: 0.92rem;
			}

			.actions {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5rem;
			}

			.act,
			.merge-button {
				padding: 0.2rem 0.7rem 0.25rem;
				border: 1.5px solid currentColor;
				border-radius: 12px 16px 10px 14px / 14px 10px 16px 12px;
				background: transparent;
				color: inherit;
				font: inherit;
				font-size: 0.85rem;
				font-weight: 700;
				cursor: pointer;
				box-shadow: 1px 2px 0 currentColor;
				transition: transform 120ms ease, background 160ms ease;
			}

			.act:hover,
			.merge-button:hover {
				background: color-mix(in oklch, var(--pink) 25%, transparent);
			}

			.act:active,
			.merge-button:active {
				transform: translate(1px, 2px);
				box-shadow: none;
			}

			.act:focus-visible,
			.merge-button:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 2px;
			}

			.merge {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.4rem 0.8rem;
				padding: 0.55rem 0.75rem;
				border: 2px solid currentColor;
				border-radius: 12px 9px 14px 10px;
			}

			.merge .state {
				flex: 1 1 10rem;
				font-weight: 700;
			}

			.ready .merge-button,
			.queued .merge-button {
				background: color-mix(in oklch, var(--pink) 70%, transparent);
				color: oklch(28% 0.015 90);
			}

			.queued .merge-button {
				opacity: 0.6;
			}

			.pointer {
				flex-basis: 100%;
				font-family: 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.08em;
				font-size: 0.9rem;
				color: #cb2431;
				display: none;
			}

			.pointer.on {
				display: block;
			}

			@media (prefers-reduced-motion: reduce) {
				.review-toy * {
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
