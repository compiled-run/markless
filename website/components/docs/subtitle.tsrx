// The line under a family's title: what the component is, in one breath. A
// component rather than a markdown paragraph because MDX rejects raw HTML, so a
// page has no other way to mark one paragraph as the subtitle.
import type { Children } from '@markless/core';
import Term from './term.tsrx';
import { splitTerms } from './term-split.ts';

/**
 * `text` is the line. `terms` lists words in it, space separated, that open a `Term` popup.
 * `children` takes static markup instead of `text`: MDX passes only plain markup to a component, never another component.
 */
export default function Subtitle({
	text,
	terms,
	children,
}: {
	readonly text?: string;
	readonly terms?: string;
	readonly children?: Children;
}) @{
	const pieces = splitTerms(text ?? '', terms ?? '');

	<>
	@if (terms) {
		// A div: each term's popup is a div, which a <p> cannot hold.
		<div class="page-subtitle rich" role="paragraph">
			@for (const piece of pieces; key piece.key) {
				@if (piece.term) {
					<Term word={piece.text} />
				} @else {
					<>{piece.text}</>
				}
			}
			<style>
				.page-subtitle {
					max-width: 46ch;
					margin-block: -0.2em var(--space-m);
					font-size: var(--step-1);
					line-height: 135%;
				}
			</style>
		</div>
	} @else {
		<p class="page-subtitle">
			{text}
			{children}
			<style>
				.page-subtitle {
					max-width: 46ch;
					margin-block: -0.2em var(--space-m);
					font-size: var(--step-1);
					line-height: 135%;
				}
			</style>
		</p>
	}
	</>
}
