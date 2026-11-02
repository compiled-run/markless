import InkLogo from '../ink-logo.tsrx';
import { openDocsSearch, warmDocsSearch } from './open.ts';

/** The header's way into the docs search: a magnifier and the shortcut, which loads the index on hover and opens the dialog on press. */
export default function SearchButton() @{
	<button
		type="button"
		class="search-button"
		aria-label="Search the docs"
		aria-haspopup="dialog"
		aria-keyshortcuts="Meta+K Control+K"
		title="Search the docs"
		onClick={() => openDocsSearch()}
		onPointerenter={() => warmDocsSearch()}
		onFocus={() => warmDocsSearch()}
	>
		<InkLogo mark="magnifier" />
		<span class="words">Search</span>
		<kbd class="shortcut"><span class="mac">⌘K</span><span class="other">Ctrl K</span></kbd>
		<style>
			.search-button {
				display: inline-flex;
				align-items: center;
				gap: 0.2rem;
				margin-inline-end: 0.6rem;
				padding: 0.2rem 0.55rem 0.2rem 0.45rem;
				font: inherit;
				color: var(--ink);
				background: var(--code-surface);
				border: 1.5px solid color-mix(in oklch, var(--ink) 45%, transparent);
				border-radius: 0.8rem 0.6rem 0.9rem 0.7rem / 0.7rem 0.9rem 0.6rem 0.8rem;
				cursor: pointer;
			}

			.search-button:hover {
				border-color: var(--ink);
			}

			.search-button:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.words {
				margin-inline-end: 0.5rem;
			}

			.shortcut {
				padding: 0 0.3rem;
				font: inherit;
				font-size: var(--step--2);
				border: 1px solid color-mix(in oklch, var(--ink) 35%, transparent);
				border-radius: 0.3rem;
				opacity: 0.8;
			}

			.other,
			html[data-docs-search-mac] .mac {
				display: inline;
			}

			.mac,
			html[data-docs-search-mac] .other {
				display: none;
			}

			@media (max-width: 46rem) {
				.words,
				.shortcut {
					display: none;
				}
			}
		</style>
	</button>
}
