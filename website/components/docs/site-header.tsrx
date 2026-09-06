import Mascot from '../mascot.tsrx';
import { lucide } from '@markless/ui';
import { breadcrumbFor } from '../../nav.ts';

export default function SiteHeader({ pathname }: { readonly pathname: string }) @{
	const crumb = breadcrumbFor(pathname);

	<header class="site-header">
		<style>
			/* ---------------------------------------------------------------------------
			   Docs chrome: header, sidebar, prose column. Tokens only, no new palette.
			   --------------------------------------------------------------------------- */
			.site-header {
				position: sticky;
				top: 0;
				z-index: 30;
				box-sizing: border-box;
				min-height: var(--header-height);
				display: flex;
				align-items: center;
				gap: 0.45em;
				padding-inline: var(--space-s-l);
				background: var(--paper);
				border-bottom: 1px solid var(--code-edge);
				font-size: var(--step--1);
				overflow: hidden;
			}

			@media (max-width: 46rem) {
				.crumb-section,
				.crumb-sep-section,
				.site-search {
					display: none;
				}

				.crumb-page {
					min-width: 0;
				}
			}

			.crumb {
				display: inline-flex;
				gap: 0.35em;
				align-items: center;
				color: var(--ink);
				text-decoration: none;
				white-space: nowrap;
			}

			.crumb-page {
				font-weight: 700;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.crumb-sep {
				width: 1em;
				height: 1em;
				color: currentColor;
				opacity: 0.45;
			}

			.header-tools {
				display: flex;
				gap: 0.45em;
				align-items: center;
				margin-left: auto;
			}

			/* Search is a slot: the markup is here and the behaviour is not, because there
			   is no index yet. */
			.site-search {
				box-sizing: border-box;
				width: 11rem;
				max-width: 32vw;
				padding: 0.2em 0.7em;
				font-size: inherit;
				color: var(--ink);
				background: var(--code-surface);
				border: 2px solid var(--code-edge);
				border-radius: 999px;
			}

			/* The theme toggle is an island a page renders, not part of the document, so it
			   cannot be a child of this header (NOTES.md finding 19). `.theme-toggle-slot`
			   is the hole it is reserved at the end of the row, and `.theme-toggle-island`
			   is pinned to exactly that hole: last in the row means its right edge is the
			   header's own inline padding, which is a number both rules can name. The
			   witness compares the two boxes rather than trusting that. */
			.theme-toggle-slot {
				display: inline-block;
				inline-size: var(--theme-toggle-size);
				block-size: var(--theme-toggle-size);
				flex: none;
			}

			.header-link {
				color: var(--ink);
				text-decoration-color: var(--pink);
				text-decoration-thickness: 0.12em;
				text-underline-offset: 0.16em;
				white-space: nowrap;
			}

			html .site-search {
				display: none;
			}

			@media (max-width: 30rem) {
				html .header-link {
					display: none;
				}

				html :is(.crumb-section, .crumb-sep) {
					display: none;
				}
			}
		</style>
		<a class="crumb crumb-home" href="/markless">
			<span>Home</span>
		</a>
		<lucide.chevronright class="crumb-sep crumb-sep-section" aria-hidden="true" />
		<span class="crumb crumb-section">{crumb.section}</span>
		<lucide.chevronright class="crumb-sep" aria-hidden="true" />
		<span class="crumb crumb-page">{crumb.page}</span>
		<div class="header-tools">
			<input
				class="site-search"
				type="search"
				placeholder="Search"
				aria-label="Search"
				title="Search is coming"
				disabled
			/>
			<a class="header-link" href="https://github.com/compiled-run/markless">GitHub</a>
			<span class="theme-toggle-slot" aria-hidden="true"></span>
		</div>
	</header>
}
