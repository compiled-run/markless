// The textbook column: a live demo on an ink sheet with margin notes beside it, one column under 600 px.
import type { Children } from '@markless/core';
import Ring from './ring.tsrx';

/** The figure: put an `InkScreen` first and `Notes` second as its children. */
export default function MarginNotes({
	said,
	children,
}: {
	/** One plain sentence after each change, read out by screen readers; empty before the first. */
	readonly said?: string;
	readonly children?: Children;
}) @{
	<div class="margin-notes">
		<figure class="layout">{children}</figure>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.margin-notes {
				--ring: oklch(55% 0.17 30);
				container: margin-notes / inline-size;
				margin: var(--space-m) 0;

				html.dark & {
					--ring: oklch(72% 0.14 35);
				}
			}

			.layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: var(--space-s);
				margin: 0;
			}

			@container margin-notes (min-width: 600px) {
				.layout {
					grid-template-columns: minmax(0, 1fr) 15rem;
					align-items: center;
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
	</div>
}

/** The margin column: a `NoteTitle`, then `Spots`, then a `Tally`, in that order. */
export function Notes({ children }: { readonly children?: Children }) @{
	<figcaption class="notes">
		{children}
		<style>
			.notes {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.45;
			}
		</style>
	</figcaption>
}

/** The small-caps line at the top of the notes. */
export function NoteTitle({ children }: { readonly children?: Children }) @{
	<p class="note-title">
		{children}
		<style>
			.note-title {
				margin: 0 0 0.3rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.12em;
				text-transform: uppercase;
			}
		</style>
	</p>
}

/** The numbered list of spots; each `Spot` matches a `Ring` on the sheet. */
export function Spots({
	roomy,
	children,
}: {
	/** More air between spots, for notes whose code runs to two lines. */
	readonly roomy?: boolean;
	readonly children?: Children;
}) @{
	<ol class={roomy === true ? 'spots roomy' : 'spots'}>
		{children}
		<style>
			.spots {
				display: grid;
				gap: 0.35rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.roomy {
				gap: 0.5rem;
			}
		</style>
	</ol>
}

/** One spot: its ring, the code that drives it, then what it shows in plain words. */
export function Spot({
	n,
	code,
	children,
}: {
	/** The number of the ring on the sheet. */
	readonly n: number;
	/** The code span, written as the reader would type it. */
	readonly code: string;
	readonly children?: Children;
}) @{
	<li class="spot">
		<Ring n={n} small />
		<code>{code}</code>
		<span class="what">{children}</span>
		<style>
			.spot {
				display: grid;
				grid-template-columns: auto 1fr;
				column-gap: 0.45rem;
				align-items: center;
			}

			code {
				justify-self: start;
			}

			.what {
				grid-column: 2;
				line-height: 1.2;
			}
		</style>
	</li>
}

/** The running count under a dashed rule: what ran, and how often, read live. */
export function Tally({ children }: { readonly children?: Children }) @{
	<p class="tally">
		{children}
		<style>
			.tally {
				margin: 0.7rem 0 0;
				padding-block-start: 0.6rem;
				border-block-start: 1.5px dashed color-mix(in oklch, var(--ink) 40%, transparent);
			}
		</style>
	</p>
}
