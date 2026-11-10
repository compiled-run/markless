// A grid of paper cards in the docs' ink: each an icon from the page-marks sprite, a name, one plain line, and an optional command, link, tag or muted look.
import { state } from '@markless/core';
import { asset } from '../../site-base.ts';
import type { ICONS } from './ink-icons.ts';
import { INK_MARKS } from './ink-marks.ts';

export interface InkCard {
	/** A mark from `ink-icons.ts`, drawn from the page-marks sprite. */
	readonly icon: keyof typeof ICONS;
	/** The card's title, usually a package, term or code name. */
	readonly name: string;
	/** One plain sentence at body size. */
	readonly line: string;
	/** A shell line the reader can copy. */
	readonly command?: string;
	/** Where the card links; the whole card becomes the link. */
	readonly href?: string;
	/** Greys the card, for things the reader never touches directly. */
	readonly muted?: boolean;
	/** A small ink tag beside the name, such as `error` or `warning`. */
	readonly chip?: string;
	/** The card's element id, for deep links like `#state`. */
	readonly id?: string;
}

export default function InkCards({ cards, label }: { readonly cards: readonly InkCard[]; readonly label?: string }) @{
	const marks = asset(INK_MARKS) + '#';
	let copied = state('');

	<div
		class="ink-cards-box"
		onClick={(event) => {
			const button = (event.target as Element).closest('button[data-command]') as HTMLButtonElement | null;
			if (!button) return;
			const text = button.dataset.command!;
			void navigator.clipboard?.writeText(text).then(() => {
				copied = text;
				setTimeout(() => {
					if (copied === text) copied = '';
				}, 2000);
			});
		}}
	>
		<ul class="ink-cards" aria-label={label}>
		@for (const card of cards; key card.name) {
			<li class={card.muted ? 'card ink-card muted' : 'card ink-card'} id={card.id}>
				<svg class="mark" viewBox="0 0 108 108" aria-hidden="true">
					<use href={marks + card.icon} />
				</svg>
				<div class="body">
					<p class="name">
						@if (card.href) {
							<a class="link" href={card.href}>
								{card.name}
							</a>
						} @else {
							<span>{card.name}</span>
						}
						@if (card.chip) {
							<span class="chip">{card.chip}</span>
						}
					</p>
					<p class="line">{card.line}</p>
					@if (card.command) {
						<div class="command">
							<code>{card.command}</code>
							<button type="button" class="copy" data-command={card.command} aria-label={'Copy the command: ' + card.command}>
								<svg viewBox="0 0 108 108" aria-hidden="true">
									<use href={marks + 'copy'} />
								</svg>
							</button>
						</div>
					}
				</div>
			</li>
		}
		</ul>
		<p class="sr" role="status">{copied === '' ? '' : 'Copied to your clipboard'}</p>
		<style>
			.ink-cards {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
				gap: var(--space-m) var(--space-s);
				margin: var(--space-m) 0;
				padding: 0 0.5rem 0.5rem 0;
				list-style: none;
			}

			.card {
				display: flex;
				gap: 0.8rem;
				align-items: flex-start;
				margin: 0;
				scroll-margin-top: 6rem;
			}

			.card:target {
				outline: 3px solid color-mix(in oklch, var(--yellow) 85%, transparent);
				outline-offset: 6px;
				border-radius: 10px;
			}

			.mark {
				flex: none;
				width: 2.6rem;
				height: 2.6rem;
				margin-top: 0.15rem;
				color: var(--ink);
				overflow: visible;
			}

			.body {
				min-width: 0;
			}

			.name {
				margin: 0;
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;
				align-items: baseline;
				font-family: var(--font-mono);
				font-size: 1.05rem;
				font-weight: 700;
				line-height: 1.35;
				overflow-wrap: normal;
			}

			.name > :not(.chip) {
				font-family: var(--font-mono);
			}

			.link {
				color: inherit;
				text-decoration-color: var(--link-underline);
				text-decoration-thickness: 0.12em;
				text-underline-offset: 0.16em;
			}

			.link::after {
				content: '';
				position: absolute;
				inset: 0;
			}

			.chip {
				padding: 0 0.45em;
				border: 1.5px solid currentColor;
				border-radius: 5px 7px 6px 8px;
				font: 600 0.8rem/1.5 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.05em;
			}

			.line {
				margin: 0.25rem 0 0;
			}

			.command {
				position: relative;
				z-index: 1;
				display: flex;
				gap: 0.3rem;
				align-items: center;
				margin-top: 0.5rem;
			}

			.command code {
				padding: 0.15em 0.4em;
				font-family: var(--font-mono);
				transform: none;
				border-radius: 4px;
				background: var(--code-surface);
				font-size: 0.82rem;
				line-height: 1.4;
				overflow-wrap: break-word;
			}

			.copy {
				flex: none;
				display: grid;
				place-items: center;
				width: 1.9rem;
				height: 1.9rem;
				padding: 0.25rem;
				border: 0;
				border-radius: 0.4rem;
				background: transparent;
				color: inherit;
				cursor: pointer;
				opacity: 0.75;
			}

			.copy:hover,
			.copy:focus-visible {
				opacity: 1;
			}

			.copy svg {
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.muted {
				opacity: 0.62;
			}

			.muted .mark {
				filter: grayscale(1);
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
	</div>
}
