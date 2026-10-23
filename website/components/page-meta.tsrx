// The reading time / prerequisite line under every H1, plus the page's ink mark beside the title.
import { assumesFor, iconFor } from '../nav.ts';
import { asset } from '../site-base.ts';
import { INK_MARKS } from './docs/ink-marks.ts';

export default function PageMeta({
	time,
	assumes,
	pathname,
}: {
	readonly time: string;
	readonly assumes: string;
	/** The page's route; a `.mdx` page gets it filled in from its file path. */
	readonly pathname: string;
}) @{
	const mark = iconFor(pathname);
	// `assumes` stays a plain comma-separated string of concept keys, so an MDX
	// page passes a literal, and nav.ts turns the keys into titles and hrefs.
	const items = assumesFor(assumes);
	const plain = items.length === 0 ? assumes : '';

	<p class="page-meta">
		<style>
			.page-meta {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em;
				align-items: baseline;
				margin-block: calc(var(--space-xs) * -0.5) var(--space-m);
				font-size: var(--step--1);
				color: color-mix(in oklch, var(--ink) 72%, var(--paper));
			}

			.page-meta-sep {
				opacity: 0.5;
			}

			/* MDX cannot nest a component inside a markdown heading, so the mark rides here and is lifted up beside the H1. */
			.page-meta-mark {
				width: 2.6em;
				height: 2.6em;
				flex: none;
				align-self: center;
				margin-top: -0.9em;
				overflow: visible;
			}

			/* The assumes line: one link per concept, and the slots a page does not use. */
			.page-meta-assume-link {
				color: inherit;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 0.1em;
				text-underline-offset: 0.16em;
			}

			.page-meta a.is-hidden,
			.page-meta span.is-hidden {
				display: none;
			}
		</style>
		@if (mark) {
			<svg class="page-meta-mark" viewBox="0 0 108 108" aria-hidden="true">
				<use href={asset(INK_MARKS) + '#' + mark} />
			</svg>
		}
		<span class="page-meta-time">{time}</span>
		<span class="page-meta-sep">·</span>
		<span>
			Assumes: {plain}
			@for (const item of items; key item.key) {
				<span class="page-meta-assume">
					<span class="page-meta-assume-lead">{item.lead}</span>
					<a
						class={item.known ? 'page-meta-assume-link' : 'page-meta-assume-link is-hidden'}
						href={item.href}
					>{item.title}</a>
					<span
						class={item.known ? 'page-meta-assume-plain is-hidden' : 'page-meta-assume-plain'}
					>{item.title}</span>
				</span>
			}
		</span>
	</p>
}
