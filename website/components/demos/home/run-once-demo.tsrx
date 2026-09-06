// The "Nothing hidden" witness: a heart you can click forever next to a run
// log that never gains a second entry. `ranAt` is captured when the component
// body actually executes, so the frozen timestamp is evidence, not an
// illustration: clicks run likes++, and the body never runs again.
//
// Styles are the co-located scoped <style> below (canonical); global.css
// carries a TEMPORARY mirror under `.run-once` until NOTES.md finding 26 is
// fixed.
import { state } from '@markless/core';

export default function RunOnceDemo() @{
	let likes = state(0);
	const ranAt = new Date().toLocaleTimeString('en-GB');

	<div class="run-once">
		<button aria-label="Like" onClick={() => likes++}><img src="/markless/stickers/heart.png" alt="" aria-hidden="true" /><span>{likes}</span></button>
		<div class="log">
			<span class="label">your function runs</span>
			<span class="entry">#1 at {ranAt}</span>
		</div>

		<style>
		.run-once {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: var(--space-m);
			flex-wrap: wrap;
			margin-block: var(--space-m);
			padding: var(--space-s);
			border: 2px solid var(--ink);
			border-radius: 10px;
			background: var(--raised);
			box-shadow:
				0 0 0 4px #fdfbf3,
				0 3px 10px color-mix(in oklch, var(--ink) 30%, transparent);
		}

		button {
			display: flex;
			align-items: center;
			gap: 0.35em;
			padding: 0.15em 0.5em;
			border: none;
			border-radius: 6px;
			background: transparent;
			color: var(--ink);
			font-family: 'Joy Elia', system-ui, sans-serif;
			font-size: var(--step-1);
			cursor: pointer;
		}

		button img {
			width: 2.4rem;
			transition: transform 0.12s ease;
		}

		button:hover img {
			transform: scale(1.12) rotate(-4deg);
		}

		button:active img {
			transform: scale(0.9);
		}

		.log {
			display: flex;
			flex-direction: column;
			gap: 0.15rem;
			padding: 0.5em 0.9em;
			border: 2px solid color-mix(in oklch, var(--ink) 45%, transparent);
			border-radius: 6px;
			font-family: var(--font-mono);
			font-size: var(--step--1);
		}

		.label {
			font-family: 'Joy Elia', system-ui, sans-serif;
			font-size: var(--step--2);
			opacity: 0.65;
		}

		.entry {
			color: color-mix(in oklch, var(--ink) 85%, transparent);
		}
		</style>
	</div>
}
