import { computed, state, storage } from '@markless/core';
import { tree } from '@markless/ui';
import { Link } from '@markless/core/router';
import ModeSelect from './mode-select.tsrx';
import { modeFor, sidebarFor, type SidebarEntry } from '../../nav.ts';
import { asset } from '../../site-base.ts';
import { INK_MARKS } from './ink-marks.ts';

const SLIDE = { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' };

// The layout switches once; in the frame that first paints it, the nav and the article's on-screen blocks are animated
// from where they were. Animations made there start on that frame, so none of the slide is spent before it shows.
function slide(write: () => void, focusId: string) {
	const root = document.documentElement;
	const nav = document.getElementById('docs-sidebar');
	const article = document.querySelector<HTMLElement>('.site-shell .prose');
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const from = article?.getBoundingClientRect().left;
	const navFrom = nav ? getComputedStyle(nav).translate : 'none';
	if (!still) root.dataset.sidebarSliding = '';
	write();
	const focus = () => document.getElementById(focusId)?.focus();
	requestAnimationFrame(() => {
		if (still) return void focus();
		const moves: Animation[] = [];
		if (nav) moves.push(nav.animate([{ translate: navFrom }, { translate: getComputedStyle(nav).translate }], SLIDE));
		const shift = article && from !== undefined ? from - article.getBoundingClientRect().left : 0;
		for (const block of article?.children ?? []) {
			if (shift === 0 || block === nav || block.matches('header, markless-outline, script')) continue;
			// Only blocks on screen get a layer of their own; the rest are already where they belong.
			const { top, bottom } = block.getBoundingClientRect();
			if (bottom < 0 || top > innerHeight) continue;
			moves.push(block.animate([{ translate: `${shift}px 0` }, { translate: '0 0' }], SLIDE));
		}
		void Promise.allSettled(moves.map((move) => move.finished)).then(() => {
			delete root.dataset.sidebarSliding;
			focus();
		});
	});
}

function withSection(list: string, token: string, open: boolean) {
	const rest = list.split(' ').filter((part) => part !== '' && part !== token);
	return (open ? [...rest, token] : rest).join(' ');
}

// The current page's mark is the link's own state, so two pages render the sidebar alike and a navigation keeps it.
function PageLink({ entry }: { readonly entry: SidebarEntry }) @{
	const link = state({ current: entry.active });
	const marks = asset(INK_MARKS) + '#';
	const current = computed(() => (link.current ? 'page' : undefined));

	<Link class="sidebar-link page-link" href={entry.href} tabindex={-1} aria-current={current}>
		<svg class="nav-icon" viewBox="0 0 108 108" aria-hidden="true">
			<use href={marks + entry.icon} />
		</svg>
		<tree.itemlabel class="sidebar-text">{entry.title}</tree.itemlabel>

		<style>
			.nav-icon {
				width: 2.6em;
				height: 2.6em;
				flex: none;
				overflow: visible;
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

			.sidebar-link[aria-current='page'] {
				font-weight: 700;
			}

			.sidebar-link[aria-current='page'] .sidebar-text {
				justify-self: start;
				padding: 0.02em 0.28em;
				margin-left: -0.28em;
				background: var(--yellow);
				color: var(--on-accent);
				border-radius: 3px 5px 3px 6px;
				transform: rotate(-0.8deg);
			}

			.prose .sidebar a {
				text-decoration: none;
			}

			html .prose .sidebar-link:is(:hover, :focus-visible) {
				background: var(--quiet-fill);
				outline: 1px dashed var(--ink);
				outline-offset: -3px;
			}

			.page-link {
				grid-template-columns: 1.8rem minmax(0, 1fr);
				gap: 0.5rem;
				box-sizing: border-box;
				min-height: var(--page-height);
				padding: 0.15rem 0.25rem;
				border: 0;
				line-height: 1.3;
			}

			.nav-icon {
				width: 1.8rem;
				height: 1.8rem;
			}

			.page-node:focus-visible > .page-link {
				background: var(--quiet-fill);
				outline: 1px dashed var(--ink);
				outline-offset: -3px;
			}
		</style>
	</Link>
}

export default function Sidebar({ pathname }: { readonly pathname: string }) @{
	const here = modeFor(pathname);
	const prefix = here.key === 'ui' ? 'u' : 'f';
	const sections = sidebarFor(pathname).map((section, index) => ({
		...section,
		token: prefix + (index + 1),
		expanded: section.entries.some((entry) => entry.active),
	}));
	// Sections the reader keeps open, as mode-and-position tokens ("f2 u1"); the stylesheet shows them on the first paint.
	let opened = storage('sidebar-sections', '');
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let shown = storage('sidebar', 'open');
	const marks = asset(INK_MARKS) + '#';

	<nav
		id="docs-sidebar"
		class="sidebar"
		aria-label="Documentation"
		onClick={(event) => {
			// The tree has toggled the section by the time the press reaches the nav.
			const branch = (event.target as Element).closest('.branch-trigger')?.closest('.branch');
			const token = branch?.getAttribute('data-section');
			if (token) opened = withSection(opened, token, branch?.getAttribute('aria-expanded') === 'true');
		}}
		onSidebarleave={(event) => {
			if (event.detail) opened = withSection(opened, event.detail, true);
		}}
		onSidebararrive={() => {
			const kept = opened.split(' ');
			for (const branch of document.querySelectorAll<HTMLElement>('#docs-sidebar .branch[aria-expanded="false"]'))
				if (kept.includes(branch.dataset.section ?? '')) branch.querySelector<HTMLElement>('.branch-trigger')?.click();
		}}
		onKeydown={(event) => {
			const row = event.target as HTMLElement;
			const token = row.getAttribute('data-section');
			if (token) opened = withSection(opened, token, row.getAttribute('aria-expanded') === 'true');
			if (event.key !== 'Enter') return;
			if (row.hasAttribute('data-page-href')) row.querySelector<HTMLAnchorElement>('a')?.click();
		}}
	>
		<button
			id="sidebar-open"
			type="button"
			class="sidebar-toggle sidebar-open"
			aria-label="Open sidebar"
			title="Open sidebar"
			aria-expanded="false"
			aria-controls="docs-sidebar"
			onClick={() => {
				slide(() => {
					shown = 'open';
				}, 'sidebar-close');
			}}
		>
			<svg class="sidebar-toggle-icon" viewBox="0 0 108 108" aria-hidden="true">
				<use href={marks + 'sidebar-panel'} />
			</svg>
		</button>
		<div class="sidebar-scroll">
			<div class="sidebar-head">
				<ModeSelect mode={here.key} />
				<button
					id="sidebar-close"
					type="button"
					class="sidebar-toggle sidebar-close"
					aria-label="Close sidebar"
					title="Close sidebar"
					aria-expanded="true"
					aria-controls="docs-sidebar"
					onClick={() => {
						slide(() => {
							shown = 'closed';
						}, 'sidebar-open');
					}}
				>
					<svg class="sidebar-toggle-icon" viewBox="0 0 108 108" aria-hidden="true">
						<use href={marks + 'sidebar-panel'} />
					</svg>
				</button>
			</div>
			<details class="sidebar-disclosure">
				<summary class="sidebar-summary">Browse pages</summary>
				<tree.root class="page-tree" aria-label="Documentation pages">
					<div role="none">
						@for (const section of sections; key section.title) {
							<tree.item
								class={'branch stroke-' + (section.stroke ?? 'pink')}
								open={section.expanded}
								level={1}
								aria-label={section.title}
								data-section={section.token}
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
												<PageLink entry={entry} />
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
		</div>

		<style>
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

			/* The nav slides as one piece; the list inside it scrolls, so nothing the slide moves is clipped. */
			.sidebar {
				position: fixed;
				left: var(--space-s-l);
				top: calc(var(--header-height) + var(--space-s));
				width: 16rem;
				font-size: var(--step--1);
			}

			.sidebar-scroll {
				max-height: calc(100vh - var(--header-height) - var(--space-s));
				overflow-y: auto;
				overscroll-behavior: contain;
				scrollbar-width: none;
				padding-block: 0.5rem 1rem;
			}

			.sidebar-scroll::-webkit-scrollbar {
				display: none;
			}

			@media (max-width: 70rem) {
				.sidebar {
					position: static;
					width: auto;
					max-width: 68ch;
					margin-inline: auto;
				}

				.sidebar-scroll {
					max-height: none;
					overflow: visible;
					padding-block: var(--space-s) 0;
				}
			}

			.page-tree {
				--branch-height: 2.5rem;
				--branch-gap: 0.375rem;
				--page-height: 2.5rem;
				--path-ink: var(--muted-ink);
				font-size: 1rem;
				line-height: 1.3;
				padding: 0.2rem;
			}

			.branch {
				position: relative;
				padding-block-end: var(--branch-gap);
			}

			.branch-trigger {
				position: relative;
				display: grid;
				grid-template-columns: 1.25rem minmax(0, 1fr);
				align-items: center;
				gap: 0.65rem;
				width: 100%;
				min-height: var(--branch-height);
				padding: 0.2rem 0.25rem;
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

			.branch:has([aria-current='page']) > .branch-trigger .branch-indicator {
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
				height: calc(100% + var(--branch-gap) - 1.4rem);
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
				display: block;
				inset-inline-start: -0.625rem;
				width: 1.775rem;
				height: calc(1.7rem + var(--branch-height) / 2);
				margin-block-start: 0.1rem;
				margin-block-end: calc(0.7rem - var(--branch-gap) - var(--branch-height) / 2);
			}

			.page-node {
				position: relative;
			}

			.page-connector {
				inset-inline-start: 0.25rem;
				inset-block-start: calc(50% + 0.8rem);
				width: 1.8rem;
				height: calc(100% - 1.6rem);
			}

			.branch-trigger:hover,
			.branch:focus-visible > .branch-trigger {
				background: var(--quiet-fill);
				outline: 1px dashed var(--ink);
				outline-offset: -3px;
			}

			.branch:focus-visible,
			.page-node:focus-visible {
				outline: none;
			}

			.sidebar-head {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin-bottom: var(--space-s);
				padding-inline-end: 0.5rem;
			}

			.sidebar-toggle {
				display: none;
				align-items: center;
				justify-content: center;
				flex: none;
				inline-size: 2.25rem;
				block-size: 2.25rem;
				padding: 0;
				color: var(--ink);
				background: none;
				border: 0;
				border-radius: 6px;
				cursor: pointer;
			}

			.sidebar-toggle:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.sidebar-toggle:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 2px;
			}

			.sidebar-toggle-icon {
				inline-size: 1.5rem;
				block-size: 1.5rem;
				overflow: visible;
			}

			/* A section the reader left open shows on the first paint, before the page wakes and opens it for real. */
			:is(
			html[data-sidebar-sections~='f1'] .branch[data-section='f1'],
			html[data-sidebar-sections~='f2'] .branch[data-section='f2'],
			html[data-sidebar-sections~='f3'] .branch[data-section='f3'],
			html[data-sidebar-sections~='f4'] .branch[data-section='f4'],
			html[data-sidebar-sections~='f5'] .branch[data-section='f5'],
			html[data-sidebar-sections~='f6'] .branch[data-section='f6'],
			html[data-sidebar-sections~='f7'] .branch[data-section='f7'],
			html[data-sidebar-sections~='f8'] .branch[data-section='f8'],
			html[data-sidebar-sections~='f9'] .branch[data-section='f9'],
			html[data-sidebar-sections~='f10'] .branch[data-section='f10'],
			html[data-sidebar-sections~='f11'] .branch[data-section='f11'],
			html[data-sidebar-sections~='f12'] .branch[data-section='f12'],
			html[data-sidebar-sections~='u1'] .branch[data-section='u1'],
			html[data-sidebar-sections~='u2'] .branch[data-section='u2'],
			html[data-sidebar-sections~='u3'] .branch[data-section='u3'],
			html[data-sidebar-sections~='u4'] .branch[data-section='u4'],
			html[data-sidebar-sections~='u5'] .branch[data-section='u5'],
			html[data-sidebar-sections~='u6'] .branch[data-section='u6'],
			html[data-sidebar-sections~='u7'] .branch[data-section='u7'],
			html[data-sidebar-sections~='u8'] .branch[data-section='u8'],
			html[data-sidebar-sections~='u9'] .branch[data-section='u9'],
			html[data-sidebar-sections~='u10'] .branch[data-section='u10'],
			html[data-sidebar-sections~='u11'] .branch[data-section='u11'],
			html[data-sidebar-sections~='u12'] .branch[data-section='u12']
			) {
				& > .branch-content {
					display: block;
				}

				& > .branch-trigger .node-chevron {
					rotate: 90deg;
				}

				& > .branch-trigger .branch-connector {
					display: none;
				}
			}

			/* Closing is a desktop choice: below 70rem the sidebar is the phone's page list. The nav slides by translate, held on its own layer while it moves. */
			@media (min-width: 70.01rem) {
				.sidebar-close {
					display: inline-flex;
				}

				.sidebar-open {
					position: absolute;
					inset-inline-start: calc(100% + var(--space-s-l));
					inset-block-start: 0.5rem;
				}

				html[data-sidebar='closed'] .sidebar {
					translate: calc(-100% - var(--space-s-l)) 0;
				}

				html[data-sidebar='closed']:not([data-sidebar-sliding]) .sidebar {
					visibility: hidden;
				}

				/* One toggle shows at a time: the reopen button rides out hidden and fades in once the nav has landed. */
				html[data-sidebar='closed'] .sidebar-open {
					display: inline-flex;
					visibility: visible;
					transition: opacity 120ms ease-out;
				}

				html[data-sidebar-sliding] .sidebar-open {
					opacity: 0;
					transition: none;
				}

				html[data-sidebar-sliding] .sidebar {
					will-change: translate;
				}

				/* The page moves under a resting pointer for one slide; hover waits for it to land. */
				html[data-sidebar-sliding] body {
					pointer-events: none;
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
