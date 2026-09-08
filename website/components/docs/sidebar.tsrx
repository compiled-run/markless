import { tree } from '@markless/ui';
import Mascot from '../mascot.tsrx';
import ModeSelect from './mode-select.tsrx';
import { modeFor, sidebarFor } from '../../nav.ts';

export default function Sidebar({ pathname }: { readonly pathname: string }) @{
	const here = modeFor(pathname);
	const sections = sidebarFor(pathname).map((section) => ({
		...section,
		expanded: section.entries.some((entry) => entry.active),
		entries: section.entries.map((entry) => ({
			...entry,
			icon: here.key === 'ui'
				? 'ui/' + (entry.href === here.href ? 'overview' : entry.href.slice(here.href.length + 1))
				: entry.icon,
		})),
	}));

	<nav
		class="sidebar"
		aria-label="Documentation"
		onKeydown={(event) => {
			if (event.key !== 'Enter') return;
			const row = event.target as HTMLElement;
			if (row.hasAttribute('data-page-href')) row.querySelector<HTMLAnchorElement>('a')?.click();
		}}
	>
		<a class="site-mark" href="/markless">
			<Mascot name="markless" size="2.5rem" variant="mark" />
			<span class="site-name">Markless</span>
		</a>
		<ModeSelect mode={here.key} />
		<details class="sidebar-disclosure">
			<summary class="sidebar-summary">Browse pages</summary>
			<tree.root class="page-tree" aria-label="Documentation pages">
				<div role="none">
					@for (const section of sections; key section.title) {
						<tree.item
							class={'branch stroke-' + (section.stroke ?? 'pink') + (section.expanded ? ' branch-current' : '')}
							open={section.expanded}
							level={1}
							aria-label={section.title}
						>
							<tree.itemtrigger class="branch-trigger">
								<tree.itemindicator class="branch-indicator" aria-hidden="true">
									<svg class="branch-node" viewBox="0 0 24 24" fill="none">
										<circle cx="12" cy="12" r="9" fill="currentColor" />
										<path class="node-chevron" d="m10 8 4 4-4 4" />
									</svg>
								</tree.itemindicator>
								<tree.itemlabel class="branch-title">{section.title}</tree.itemlabel>
								<svg class="branch-connector path-line" viewBox="0 0 24 48" preserveAspectRatio="none" aria-hidden="true">
									<path d="M12 1 C11 14 13 34 12 47" />
								</svg>
							</tree.itemtrigger>
							<tree.itemcontent class="branch-content">
								<svg class="branch-elbow path-line" viewBox="0 0 24 48" preserveAspectRatio="none" aria-hidden="true">
									<path d="M1 1 V28 Q1 47 23 47" />
								</svg>
								<div role="none">
									@for (const entry of section.entries; key entry.href) {
										<tree.item leaf level={2} class="page-node" aria-label={entry.title} data-page-href={entry.href}>
											<svg class="page-connector path-line" viewBox="0 0 24 24" preserveAspectRatio="none" aria-hidden="true">
												<path d="M12 1 V23" />
											</svg>
											<a
												class={entry.active ? 'sidebar-link page-link is-active' : 'sidebar-link page-link'}
												href={entry.href}
												tabindex={-1}
												aria-current={entry.active ? 'page' : undefined}
											>
												<span class="nav-icon" aria-hidden="true">
													<img
														class="nav-icon-ink nav-icon-light"
														src={entry.icon ? '/markless/sidebar/' + entry.icon + '-light.png' : '/markless/sprites/' + (entry.sprite ?? 'sparkle') + '.png'}
														alt=""
														decoding="async"
													/>
													<img
														class="nav-icon-ink nav-icon-dark"
														src={entry.icon ? '/markless/sidebar/' + entry.icon + '-dark.png' : '/markless/sprites/' + (entry.sprite ?? 'sparkle') + '.dark.png'}
														alt=""
														decoding="async"
													/>
												</span>
												<tree.itemlabel class="sidebar-text">{entry.title}</tree.itemlabel>
											</a>
										</tree.item>
									}
								</div>
								<svg class="branch-return path-line" viewBox="0 0 40 32" preserveAspectRatio="none" aria-hidden="true">
									<path d="M39 1 C39 26 1 6 1 31" />
								</svg>
							</tree.itemcontent>
						</tree.item>
					}
				</div>
			</tree.root>
		</details>

		<style>
			.site-name {
				display: block;
				font-size: var(--step-1);
				font-weight: 700;
				color: var(--ink);
				text-decoration: none;
				margin-bottom: var(--space-m);
				--shadow-color: var(--yellow);
			}

			/* The nav list is inside a <details> with no `open` attribute, so a phone gets
			   one line of navigation instead of nineteen and the article's h1 is in the
			   first screenful. Above 70rem the column sits beside the prose, so the
			   disclosure is opened here and its summary is not painted. */
			.sidebar-summary {
				display: none;
			}

			.sidebar-disclosure::details-content {
				content-visibility: visible;
				block-size: auto;
				overflow: visible;
			}

			@media (max-width: 70rem) {
				.sidebar-summary {
					display: block;
					padding: 0.35em 0.7em;
					border: 2px solid var(--ink);
					border-radius: 8px;
					background: var(--raised);
					font-size: var(--step--1);
					font-weight: 700;
					cursor: pointer;
				}

				.sidebar-disclosure[open] .sidebar-summary {
					margin-bottom: var(--space-xs);
				}

				.sidebar-disclosure::details-content {
					content-visibility: hidden;
					block-size: 0;
					overflow: hidden;
				}

				.sidebar-disclosure[open]::details-content {
					content-visibility: visible;
					block-size: auto;
					overflow: visible;
				}
			}

			/* One hand-drawn icon per sidebar entry, cut from the owner's sheet in both
			   variants (`tooling/cut-sprites.ts sidebar`). Both are in the markup and the
			   theme decides which one is displayed, the same trick `.sprite` uses. */
			.nav-icon {
				display: inline-block;
				width: 2.6em;
				height: 2.6em;
				flex: none;
				line-height: 1;
			}

			@media (max-width: 70rem) {
				.nav-icon {
					width: 2em;
					height: 2em;
				}

				.sidebar-link {
					min-height: 2.5em;
				}
			}

			.nav-icon-ink {
				width: 100%;
				height: 100%;
				object-fit: contain;
			}

			.nav-icon-light {
				display: var(--sprite-light);
			}

			.nav-icon-dark {
				display: var(--sprite-dark);
			}

			/* Three columns, so the sprite, the number and the title line up down the
			   column. The resting border is transparent and the same width as the active
			   one, so nothing shifts when an entry becomes the current page. */
			.sidebar-link {
				display: grid;
				grid-template-columns: 2.6em 1.2em 1fr;
				gap: 0.45em;
				align-items: center;
				min-height: 3em;
				padding: 0.3em 0.5em;
				color: var(--ink);
				text-decoration: none;
				border: 2px solid transparent;
				border-radius: 6px;
				line-height: 130%;
			}

			/* Hover is a wash of the page's own ink, so one rule reads right on both
			   grounds. The current page is not a filled row: its title alone is run over
			   with the yellow marker, dark ink on a pastel like everything else printed on
			   an accent. */
			.sidebar-link:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.sidebar-link.is-active {
				font-weight: 700;
			}

			.sidebar-link.is-active .sidebar-text {
				justify-self: start;
				padding: 0.02em 0.28em;
				margin-left: -0.28em;
				background: var(--yellow);
				color: var(--on-accent);
				border-radius: 3px 5px 3px 6px;
				transform: rotate(-0.8deg);
			}

			/* The site mark: the markless mug beside the word. */
			.site-mark {
				display: flex;
				gap: 0.5rem;
				align-items: center;
				margin-bottom: var(--space-m);
				text-decoration: none;
			}

			.site-mark .site-name {
				margin-bottom: 0;
			}

			.sidebar {
				position: fixed;
				left: var(--space-s-l);
				top: calc(var(--header-height) + var(--space-s));
				width: 16rem;
				max-height: calc(100vh - var(--header-height) - var(--space-s));
				overflow-y: auto;
				/* The rail scrolls, but its track is not part of the drawing: the fade at the
				   bottom (T017) is what says there is more list under the fold. */
				scrollbar-width: none;
				padding-block: var(--space-s);
				font-size: var(--step--1);
			}

			.sidebar::-webkit-scrollbar {
				display: none;
			}

			@media (min-width: 70.01rem) and (max-height: 62rem) {
				.sidebar {
					mask-image: linear-gradient(to bottom, #000 calc(100% - 3rem), transparent 100%);
				}
			}

			@media (max-width: 70rem) {
				.sidebar {
					position: static;
					width: auto;
					max-height: none;
					max-width: 68ch;
					margin-inline: auto;
					padding-block: var(--space-s) 0;
				}
			}

			.prose .sidebar a {
				text-decoration: none;
			}

			html .prose .sidebar-link:is(:hover, :focus-visible) {
				background: var(--quiet-fill);
				outline: 1px dashed var(--ink);
				outline-offset: -3px;
			}

			.sidebar {
				padding-block: 0.5rem 1rem;
				mask-image: none;
			}

			.site-mark {
				margin-bottom: 1rem;
			}

			.page-tree {
				--branch-height: 2.75rem;
				--page-height: 2.5rem;
				--path-ink: var(--muted-ink);
				font-size: 1rem;
				padding: 0.2rem;
			}

			.branch {
				position: relative;
				padding-block-end: 0.5rem;
			}

			.branch-trigger {
				position: relative;
				display: grid;
				grid-template-columns: 1.25rem minmax(0, 1fr);
				align-items: center;
				gap: 0.65rem;
				width: 100%;
				min-height: var(--branch-height);
				padding: 0.35rem 0.25rem;
				border: 0;
				border-radius: 5px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-weight: 600;
				text-align: start;
				cursor: pointer;
			}

			.branch-indicator {
				display: inline-flex;
				width: 1.25rem;
				height: 1.25rem;
				color: var(--path-ink);
			}

			.branch-current > .branch-trigger .branch-indicator {
				color: var(--ink);
			}

			.branch-node {
				width: 100%;
				height: 100%;
			}

			.node-chevron {
				stroke: var(--paper);
				stroke-width: 2;
				stroke-linecap: round;
				stroke-linejoin: round;
				transform-origin: center;
				transition: rotate 150ms ease;
			}

			.branch-indicator[ui-open] .node-chevron {
				rotate: 90deg;
			}

			.path-line {
				position: absolute;
				fill: none;
				stroke: var(--path-ink);
				stroke-width: 1.75;
				stroke-linecap: round;
				overflow: visible;
				pointer-events: none;
			}

			.path-line path {
				vector-effect: non-scaling-stroke;
			}

			.branch-connector {
				inset-inline-start: 0.25rem;
				inset-block-start: calc(50% + 0.7rem);
				width: 1.25rem;
				height: calc(100% - 0.9rem);
			}

			.branch[ui-open] > .branch-trigger .branch-connector,
			.branch:last-child > .branch-trigger .branch-connector,
			.branch:last-child > .branch-content .branch-return,
			.page-node:last-child > .page-connector {
				display: none;
			}

			.stroke-pink {
				--branch-accent: var(--pink);
			}
			.stroke-purple {
				--branch-accent: var(--purple);
			}
			.stroke-yellow {
				--branch-accent: var(--yellow);
			}
			.stroke-green {
				--branch-accent: var(--green-star);
			}

			.branch-content {
				position: relative;
				padding-inline-start: 1.5rem;
			}

			.branch-elbow {
				inset-inline-start: 0.875rem;
				inset-block-start: calc(0.7rem - var(--branch-height) / 2);
				width: 0.65rem;
				height: calc((var(--branch-height) + var(--page-height)) / 2 - 0.7rem);
			}

			.branch-return {
				position: relative;
				inset-inline-start: -0.625rem;
				width: 1.775rem;
				height: calc(1.05rem + var(--branch-height) / 2);
				margin-block-start: 0.1rem;
				margin-block-end: calc(0.2rem - var(--branch-height) / 2);
			}

			.page-node {
				position: relative;
			}

			.page-connector {
				inset-inline-start: 0.25rem;
				inset-block-start: calc(50% + 1rem);
				width: 1.8rem;
				height: calc(100% - 2rem);
			}

			.page-link {
				grid-template-columns: 1.8rem minmax(0, 1fr);
				gap: 0.5rem;
				min-height: var(--page-height);
				padding: 0.15rem 0.25rem;
				border: 0;
				line-height: 1.3;
			}

			.nav-icon {
				width: 1.8rem;
				height: 1.8rem;
			}

			.branch-trigger:hover,
			.branch:focus-visible > .branch-trigger,
			.page-node:focus-visible > .page-link {
				background: var(--quiet-fill);
				outline: 1px dashed var(--ink);
				outline-offset: -3px;
			}

			.branch:focus-visible,
			.page-node:focus-visible {
				outline: none;
			}

			@media (max-width: 70rem) {
				.page-tree {
					--page-height: 2.75rem;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.node-chevron {
					transition: none;
				}
			}
		</style>
	</nav>
}
