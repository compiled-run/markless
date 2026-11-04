import { state, storage } from '@markless/core';
import { lucide, modal, navbar } from '@markless/ui';
import { asset } from '../../../site-base.ts';
import { INK_MARKS } from '../ink-marks.ts';
import { github, isCurrent, NAV_DECOR, type NavCard, type NavPanel, panels } from './sections.ts';
import { art } from './theme-art.art.ts';


/** The site's header: a floating bar with two panels and the Migrate link on a wide screen, a top bar and a full-screen menu on a narrow one. */
export default function SiteNavbar({ pathname }: { readonly pathname: string }) @{
	<header class="site-navbar">
		<MobileMenu pathname={pathname} />
		<DesktopNav pathname={pathname} />

		<style>
			.site-navbar {
				position: relative;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 1rem;
				line-height: 1.5;
				color: var(--ink);
			}

			/* The page grain is drawn on the scrolling document, so each fixed surface sits above it with the same grain pinned to itself. */
			:is(.nav-pill, .nav-box, .card, .mobile-menu > .mobile-bar)::before,
			:is(.nav-pill, .nav-box, .card, .mobile-menu > .mobile-bar)::after {
				content: '';
				position: absolute;
				inset: 0;
				z-index: 1;
				border-radius: inherit;
				pointer-events: none;
			}

			.nav-pill::before,
			.nav-pill::after {
				inset: -2px;
			}

			/* A code block expanded without the Fullscreen API covers the page below the grain, so the bars above it step aside. */
			html:has([data-expanded]) :is(.nav-pill, .mobile-bar) {
				visibility: hidden;
			}

			:is(.nav-pill, .nav-box, .card, .mobile-menu > .mobile-bar)::before {
				background-image: var(--grain-fiber);
				mix-blend-mode: var(--grain-fiber-blend);
				opacity: var(--grain-fiber-opacity);
			}

			:is(.nav-pill, .nav-box, .card, .mobile-menu > .mobile-bar)::after {
				background-image: var(--grain-speck);
				mix-blend-mode: var(--grain-speck-blend);
				opacity: var(--grain-speck-opacity);
			}
		</style>
	</header>
}

/** The home link's mark: the ink mug alone, since every page already carries the name. */
function Brand() @{
	<svg class="brand-mug" viewBox="0 0 108 108" aria-hidden="true">
		<use href={asset(INK_MARKS) + '#markless-mug'} />

		<style>
			.brand-mug {
				display: block;
				inline-size: 1.65rem;
				block-size: 1.65rem;
				overflow: visible;
			}
		</style>
	</svg>
}

// The bar shows on every page, so its home link skips idle prefetch: it would download that page's code everywhere.
function DesktopNav({ pathname }: { readonly pathname: string }) @{
	const homepage = pathname === '/';

	<div class="nav-shade">
		<navbar.root class="nav-pill navbar-edge" aria-label="Main">
			<div class="nav-tools">
				<navbar.itemlink prefetch={false} class="brand-link" href="/" current={homepage} aria-label="Markless home">
					<Brand />
				</navbar.itemlink>
				<navbar.itemlink class="tool-link" href={github} aria-label="Markless on GitHub">
					<lucide.github class="tool-icon" aria-hidden="true" />
				</navbar.itemlink>
			</div>
			<div class="nav-items">
				@for (const panel of panels; key panel.label) {
					<NavDropdown panel={panel} pathname={pathname} />
				}
			</div>
			<div class="nav-box" aria-hidden="true">
				<InkEdge name="panel" />
			</div>
			<div class="nav-tools">
				<SearchButton />
				<ThemeToggle />
			</div>
		</navbar.root>

		<style>
			.nav-shade {
				display: none;
			}

			/* A wide screen floats the bar over the prose, with room beside the sidebar; a short one keeps the top bar, since the open panel needs about 35rem of height. */
			@media (min-width: 80rem) and (min-height: 37.5rem) {
				.nav-shade {
					display: block;
				}
			}

			/* The page dims behind an open panel, so the panel reads as lifted off it. */
			.nav-shade::before {
				content: '';
				position: fixed;
				inset: 0;
				z-index: 59;
				pointer-events: none;
				background: color-mix(in oklch, var(--ink) 52%, transparent);
				opacity: 0;
				transition: opacity 325ms ease-in-out;

				html.dark & {
					background: color-mix(in oklch, black 58%, transparent);
				}
			}

			.nav-shade:has([ui-open])::before {
				opacity: 1;
			}

			.nav-pill {
				position: fixed;
				top: 1.5rem;
				left: 50%;
				box-sizing: border-box;
				display: flex;
				align-items: center;
				justify-content: space-between;
				inline-size: 100%;
				max-inline-size: 37.5rem;
				block-size: 4.375rem;
				padding-inline: 0.9rem;
				border: 2px solid var(--ink);
				border-radius: 1rem;
				background: var(--raised);
				box-shadow: 6px 6px 0 var(--muted-ink);
				translate: -50% 0;
				z-index: calc(var(--grain-z) + 1);
				transition:
					translate 300ms ease,
					opacity 300ms ease;
			}

			/* public/navbar.js marks the page while the reader scrolls down it; focus brings the bar back. */
			html[data-nav-away] .nav-pill:not([ui-open]) {
				translate: -50% calc(-100% - 1.5rem);
				opacity: 0;
			}

			.brand-link {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				color: var(--ink);
				border-radius: 999px;
			}

			.brand-link:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.nav-items {
				display: flex;
				align-items: center;
			}

			.nav-tools {
				display: flex;
				align-items: center;
				gap: 0.15rem;
			}

			.tool-link {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				border-radius: 999px;
				color: var(--ink);
			}

			.tool-link:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.tool-icon {
				inline-size: 1.3rem;
				block-size: 1.3rem;
			}

			:is(.brand-link, .tool-link):focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			@media (prefers-reduced-motion: reduce) {
				.nav-pill,
				.nav-shade::before {
					transition: none;
				}
			}
		</style>
	</div>
}

function NavDropdown({ panel, pathname }: { readonly panel: NavPanel; readonly pathname: string }) @{
	<navbar.item class="nav-item" value={panel.label}>
		<navbar.itemtrigger class="nav-trigger">
			<span>{panel.label}</span>
		</navbar.itemtrigger>
		<navbar.itemcontent class={'nav-panel nav-panel-' + panel.layout}>
			@for (const card of panel.cards; key card.label) {
				<NavCardLink card={card} pathname={pathname} />
			}
		</navbar.itemcontent>

		<style>
			.nav-item {
				position: static;
			}

			.nav-trigger {
				display: flex;
				align-items: center;
				block-size: 4.375rem;
				padding-inline: 1.1rem;
				border: 0;
				background: none;
				color: var(--ink);
				font: inherit;
				cursor: pointer;
				user-select: none;
				-webkit-user-select: none;
				transition: color 200ms ease;
			}

			.nav-trigger:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -0.9rem;
				border-radius: 8px;
			}

			.nav-trigger span {
				padding-inline: 0.2em;
				border-radius: 3px 5px 3px 6px;
				transition: background 200ms ease;
			}

			.nav-trigger:hover span,
			.nav-trigger[ui-open] span {
				background: var(--yellow);
				color: var(--on-accent);
			}

			/* The bar's translate makes it the containing block of the panels and the box behind them, so the offsets are from the bar's padding box. */
			:is(.nav-panel, .nav-box) {
				position: fixed;
				top: calc(100% + 1rem + 2px);
				left: 50%;
				box-sizing: border-box;
				inline-size: 37.5rem;
				block-size: 28rem;
				margin: 0;
				border-radius: 1rem;
				translate: -50% 0;
			}

			/* One box behind every panel, as shadcn's viewport: it stays put while the panels inside it change. */
			.nav-box {
				z-index: 59;
				display: none;
				background: var(--raised);
				box-shadow: 6px 6px 0 color-mix(in oklch, var(--muted-ink) 70%, transparent);
				opacity: 0;
				transition:
					opacity 150ms ease,
					translate var(--spring-slide-ms) var(--spring-slide),
					display 150ms allow-discrete;
			}

			/* Opening from closed drops the box a few pixels and settles it; it never slides sideways. */
			.nav-pill[ui-open] .nav-box {
				display: block;
				opacity: 1;

				@starting-style {
					opacity: 0;
					translate: -50% -0.5rem;
				}
			}

			.nav-panel {
				z-index: 60;
				display: grid;
				grid-template-columns: 1fr 1fr;
				grid-template-rows: 12.5rem 12.5rem;
				gap: 1rem;
				padding: 1rem;
				overflow: clip;
				opacity: 1;
				transition:
					opacity 150ms ease,
					translate var(--spring-slide-ms) var(--spring-slide),
					display 150ms allow-discrete;

				@starting-style {
					opacity: 0;
					translate: -50% -0.5rem;
				}
			}

			.nav-panel[hidden] {
				display: none;
				opacity: 0;
			}

			/* Switching: the cards slide solid, a whole panel's width, on the slide spring. Transitions, not keyframes: a switch mid-slide carries on from where the cards are. */
			.nav-panel[ui-from] {
				@starting-style {
					opacity: 1;
					translate: -50% 0;
				}
			}

			.nav-panel[hidden][ui-to] {
				opacity: 1;
				transition: display var(--spring-slide-ms) allow-discrete;
			}

			@media (prefers-reduced-motion: no-preference) {
				.nav-panel > .card {
					transition: translate var(--spring-slide-ms) var(--spring-slide);
				}

				.nav-panel[ui-from='end'] > .card {
					@starting-style {
						translate: 37.5rem 0;
					}
				}

				.nav-panel[ui-from='start'] > .card {
					@starting-style {
						translate: -37.5rem 0;
					}
				}

				.nav-panel[hidden][ui-to='start'] > .card {
					translate: -37.5rem 0;
				}

				.nav-panel[hidden][ui-to='end'] > .card {
					translate: 37.5rem 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.nav-panel {
					transition: none;
				}
			}
		</style>
	</navbar.item>
}

function NavCardLink({ card, pathname }: { readonly card: NavCard; readonly pathname: string }) @{
	<navbar.itemlink class={'card card-' + card.size} href={card.href} current={isCurrent(pathname, card.href)}>
		<svg class="card-art" aria-hidden="true">
			<use href={asset(NAV_DECOR) + '#' + card.art} width="100%" height="100%" />
		</svg>
		<span class="card-scrim" aria-hidden="true"></span>
		<span class="card-text">
			<span class="card-label">
				{card.label}
				@if (card.external) {
					<lucide.arrowupright class="card-out" aria-hidden="true" />
				}
			</span>
			<span class="card-note">{card.description}</span>
		</span>
		<InkEdge name={card.size === 'tall' ? 'tall' : 'card'} />

		<style>
			.card {
				position: relative;
				display: flex;
				flex-direction: column;
				overflow: hidden;
				border-radius: 0.6rem;
				background: var(--paper);
				color: var(--ink);
				text-decoration: none;
				--decor-paper: var(--paper);
				--decor-wash: var(--yellow);
				--decor-wash-opacity: 0.75;
				--decor-wash-blend: multiply;
				/* QDS sets white type on a gradient to its darkest tone; here the darkest tone is the ink in light and near-black in dark. */
				--card-scrim: var(--ink);
				--card-text: color-mix(in oklch, var(--paper) 35%, white);

				html.dark & {
					--decor-wash-opacity: 0.4;
					--decor-wash-blend: normal;
					--card-scrim: oklch(12% 0.006 70);
					--card-text: var(--ink);
				}
			}

			.card-tall {
				grid-row: 1 / 3;
			}

			/* The drawing fills the card, whole and centred, and runs on under the text as QDS's picture does. */
			.card-art {
				position: absolute;
				inset: 0.75rem 0.75rem 1.75rem;
				inline-size: calc(100% - 1.5rem);
				block-size: calc(100% - 2.5rem);
				overflow: visible;
				transition: scale var(--spring-hover-ms) var(--spring-hover);
				will-change: transform;
			}

			.card:hover .card-art,
			.card:focus-visible .card-art {
				scale: 1.05;
			}

			.card:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			/* QDS's overlay: one gradient over the whole card, clear at the top and deepening to the text, measured in rem so every card size darkens alike. */
			.card-scrim {
				position: absolute;
				inset: 0;
				pointer-events: none;
				background: linear-gradient(
					to top,
					var(--card-scrim) 0,
					color-mix(in oklch, var(--card-scrim) 96%, transparent) 3.6rem,
					color-mix(in oklch, var(--card-scrim) 62%, transparent) 5.6rem,
					color-mix(in oklch, var(--card-scrim) 22%, transparent) 7.6rem,
					transparent 9.6rem
				);
			}

			.card-text {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				display: flex;
				flex-direction: column;
				padding: 0.5rem 0.65rem 0.55rem;
				color: var(--card-text);
				pointer-events: none;
			}

			.card-label {
				font-weight: 700;
				line-height: 1.3;
			}

			.card-out {
				inline-size: 0.9em;
				block-size: 0.9em;
				margin-inline-start: 0.2em;
				vertical-align: -0.05em;
			}

			.card-note {
				font-size: 0.85rem;
				line-height: 1.35;
			}

			/* Hovering a card moves one object in its drawing. */
			@media (prefers-reduced-motion: no-preference) {
				.card:is(:hover, :focus-visible) {
					--hover: 1;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.card-art {
					transition: none;
				}
			}
		</style>
	</navbar.itemlink>
}

// The search dialog is another unit's; until it lands the button is in the walk and opens nothing.
function SearchButton() @{
	const drawing = art.magnifier;

	<navbar.trigger
		class="search-button"
		aria-label="Search docs"
		aria-keyshortcuts="Meta+K Control+K"
		title="Search docs (⌘K or Ctrl K)"
	>
		<svg class="search-icon" viewBox={'0 0 ' + drawing.width + ' ' + drawing.height} aria-hidden="true">
			@for (const layer of drawing.layers; key layer.d) {
				<path class={'theme-toggle-' + layer.kind} d={layer.d} />
			}
		</svg>

		<style>
			.search-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				padding: 0;
				border: 0;
				border-radius: 999px;
				background: none;
				color: var(--ink);
				cursor: pointer;
			}

			.search-button:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.search-button:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 1px;
			}

			.search-icon {
				inline-size: 1.55rem;
				block-size: 1.55rem;
				overflow: visible;
				transition: rotate var(--spring-hover-ms) var(--spring-hover);
			}

			@media (prefers-reduced-motion: no-preference) {
				.search-button:is(:hover, :focus-visible) .search-icon {
					rotate: -14deg;
				}
			}
		</style>
	</navbar.trigger>
}

/** A card's or panel's hand-inked edge, from the same sprite as the card drawings. */
function InkEdge({ name }: { readonly name: string }) @{
	<svg class="ink-edge" aria-hidden="true">
		<use href={asset(NAV_DECOR) + '#edge-' + name} />

		<style>
			.ink-edge {
				position: absolute;
				inset: 0;
				inline-size: 100%;
				block-size: 100%;
				overflow: visible;
				color: var(--ink);
				pointer-events: none;
			}
		</style>
	</svg>
}

function MobileMenu({ pathname }: { readonly pathname: string }) @{
	const menu = state({ open: false });

	<div class="mobile-nav">
		<modal.root
			class="mobile-menu"
			open={menu.open}
			onChange={(next: boolean) => {
				menu.open = next;
			}}
		>
			<div class="mobile-bar navbar-edge">
				<button
					type="button"
					class="bar-button sidebar-button"
					aria-label="Open sidebar"
					aria-controls="docs-sidebar"
					onClick={() => {
						const sidebar = document.getElementById('docs-sidebar');
						const pages = sidebar?.querySelector('details');
						if (pages) pages.open = true;
						sidebar?.scrollIntoView({ block: 'start' });
						pages?.querySelector<HTMLElement>('summary')?.focus();
					}}
				>
					<lucide.panelleftopen class="bar-icon" aria-hidden="true" />
				</button>
				<a prefetch={false} class="bar-brand" href="/" aria-label="Markless home">
					<Brand />
				</a>
				<span class="bar-end">
					<ThemeToggle />
					<modal.trigger class="bar-button" aria-label="Open menu">
						<lucide.menu class="bar-icon" aria-hidden="true" />
					</modal.trigger>
				</span>
			</div>

			<modal.backdrop class="menu-backdrop">
				<modal.content class="menu-panel" aria-label="Menu">
					<div class="mobile-bar menu-bar">
						<button
							type="button"
							class="bar-button sidebar-button"
							aria-label="Open sidebar"
							aria-controls="docs-sidebar"
							onClick={() => {
								menu.open = false;
								const sidebar = document.getElementById('docs-sidebar');
								const pages = sidebar?.querySelector('details');
								if (pages) pages.open = true;
								setTimeout(() => {
									sidebar?.scrollIntoView({ block: 'start' });
									pages?.querySelector<HTMLElement>('summary')?.focus();
								}, 0);
							}}
						>
							<lucide.panelleftopen class="bar-icon" aria-hidden="true" />
						</button>
						<a prefetch={false} class="bar-brand" href="/" aria-label="Markless home">
							<Brand />
						</a>
						<modal.close class="bar-button menu-close" aria-label="Close menu">
							<lucide.x class="bar-icon" aria-hidden="true" />
						</modal.close>
					</div>

					<div class="menu-body">
						<div class="menu-grid">
							@for (const panel of panels; key panel.label) {
								<div class="menu-section">
									<span class="menu-heading">{panel.label}</span>
									@for (const card of panel.cards; key card.href) {
										<a
											class="menu-link"
											href={card.href}
											aria-current={!card.skipActive && isCurrent(pathname, card.href) ? 'page' : undefined}
											onClick={() => {
												menu.open = false;
											}}
										><span class="menu-link-text">{card.label}</span></a>
									}
								</div>
							}
							<div class="menu-section">
								<span class="menu-heading">More</span>
								<a class="menu-link" href={github}><span class="menu-link-text">GitHub</span></a>
							</div>
						</div>
					</div>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<style>
			.mobile-nav {
				display: block;
			}

			@media (min-width: 80rem) and (min-height: 37.5rem) {
				.mobile-nav {
					display: none;
				}
			}

			.mobile-bar {
				position: fixed;
				inset-block-start: 0;
				inset-inline: 0;
				z-index: calc(var(--grain-z) + 1);
				box-sizing: border-box;
				display: flex;
				align-items: center;
				block-size: var(--header-height);
				padding-inline: 1rem;
				background: var(--paper);
				border-bottom: 2px solid var(--ink);
			}

			.menu-bar {
				position: relative;
				flex: none;
			}

			/* The open menu repeats the bar in the same spot; it stays under the page grain, since it is translucent and the page is locked behind it. */
			.mobile-menu[ui-open] > .mobile-bar {
				visibility: hidden;
			}

			.bar-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				padding: 0;
				border: 0;
				border-radius: 999px;
				background: none;
				color: var(--ink);
				cursor: pointer;
			}

			.bar-button:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.bar-icon {
				inline-size: 1.5rem;
				block-size: 1.5rem;
			}

			/* Above 70rem the sidebar sits open beside the prose, so there is nothing to open. */
			@media (min-width: 70.01rem) {
				.sidebar-button {
					visibility: hidden;
				}
			}

			.bar-brand {
				position: absolute;
				left: 50%;
				translate: -50% 0;
				color: var(--ink);
				text-decoration: none;
				border-radius: 6px;
			}

			.bar-end {
				display: flex;
				align-items: center;
				gap: 0.25rem;
				margin-inline-start: auto;
			}

			.menu-bar .bar-button:last-child {
				margin-inline-start: auto;
			}

			.menu-backdrop {
				position: fixed;
				inset: 0;
				z-index: 70;
			}

			.menu-backdrop[hidden] {
				display: none;
			}

			.menu-panel {
				box-sizing: border-box;
				display: flex;
				flex-direction: column;
				inline-size: 100%;
				block-size: 100%;
				overflow-y: auto;
				background: color-mix(in oklch, var(--paper) 70%, transparent);
				backdrop-filter: blur(24px);
				box-shadow: 0 2px 16px rgb(0 0 0 / 0.08);
				outline: none;
			}

			.menu-body {
				flex: 1;
				padding: 2rem 1.5rem;
			}

			.menu-grid {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 2rem;
			}

			.menu-section {
				display: flex;
				flex-direction: column;
				gap: 1rem;
				min-inline-size: 0;
			}

			.menu-heading {
				font-size: 0.875rem;
				font-weight: 700;
				line-height: 1.43;
				color: color-mix(in oklch, var(--ink) 62%, var(--paper));
			}

			.menu-link {
				padding-top: 0.25rem;
				border-bottom: 2px solid transparent;
				color: var(--ink);
				font-weight: 600;
				text-decoration: none;
				transition:
					color 150ms ease,
					border-color 150ms ease;
			}

			.menu-link:hover {
				border-bottom-color: var(--pink);
			}

			:is(.bar-button, .bar-brand, .menu-link):focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}
		</style>
	</div>
}

// The theme switch lives in this module because a page collects storage seeds only from the modules it renders directly, and the seed is what paints the stored theme before first paint.
/** Each button is a `navbar.trigger`: inside `navbar.root` the bar's arrow keys stop on it, and outside every navbar it is a plain button. */
function ThemeToggle() @{
	<span class="theme-toggle-island">
		<ThemeButton to="dark" />
		<ThemeButton to="light" />

		<style>
			.theme-toggle-island {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				flex: none;
			}
		</style>
	</span>
}

/** The button that switches to `to`. It draws the theme it stands in: the sun on the light page, the moon on the dark one. */
function ThemeButton({ to }: { readonly to: 'dark' | 'light' }) @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let theme = storage('theme', 'system');
	const label = to === 'dark' ? 'Switch to the dark theme' : 'Switch to the light theme';
	const other = to === 'dark' ? 'light' : 'dark';

	<>
		<navbar.trigger
			class={'theme-toggle theme-toggle-to-' + to}
			data-theme-toggle={to}
			aria-label={label}
			title={label}
			onClick={(event) => {
				const root = document.documentElement;
				const island = (event.target as Element).closest('.theme-toggle-island');
				root.dataset.themeSwitching = '';
				theme = to;
				// The pressed button is hidden now, so focus moves to the one that took its place.
				setTimeout(() => island?.querySelector<HTMLElement>(`[data-theme-toggle="${other}"]`)?.focus(), 0);
				setTimeout(() => delete root.dataset.themeSwitching, 700);
			}}
		>
			<ThemeDrawing to={to} />
		</navbar.trigger>

		<style>
			.theme-toggle {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 100%;
				block-size: 100%;
				padding: 0;
				color: var(--ink);
				background: none;
				border: 0;
				border-radius: 999px;
				cursor: pointer;
			}

			/* Only a click animates the swap, never a page load or a navigation that renders the toggle afresh. */
			/* No display transition: the drawing being replaced leaves in the same frame the new one arrives, so no frame shows both. */
			html[data-theme-switching] .theme-toggle {
				transition:
					rotate 420ms cubic-bezier(0.3, 1.5, 0.5, 1),
					scale 420ms cubic-bezier(0.3, 1.5, 0.5, 1),
					opacity 240ms ease;

				@starting-style {
					rotate: -70deg;
					scale: 0.4;
					opacity: 0;
				}
			}

			.theme-toggle:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.theme-toggle:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 1px;
			}

			/* The button offered is the one for the palette not painted: theme.js
			   resolves `system` and puts the painted palette on <html> as a class. */
			.theme-toggle-to-dark {
				display: inline-flex;

				html.dark & {
					display: none;
				}
			}

			.theme-toggle-to-light {
				display: none;

				html.dark & {
					display: inline-flex;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				html[data-theme-switching] .theme-toggle {
					transition: none;
				}
			}
		</style>
	</>
}

function ThemeDrawing({ to }: { readonly to: 'dark' | 'light' }) @{
	const drawing = to === 'dark' ? art.sun : art.moon;

	<svg
		class={to === 'dark' ? 'theme-toggle-icon theme-toggle-sun' : 'theme-toggle-icon theme-toggle-moon'}
		viewBox={'0 0 ' + drawing.width + ' ' + drawing.height}
		aria-hidden="true"
	>
		@for (const layer of drawing.layers; key layer.d) {
			<path class={'theme-toggle-' + layer.kind} d={layer.d} />
		}

		<style>
			.theme-toggle-icon {
				inline-size: 1.9rem;
				block-size: 1.9rem;
				overflow: visible;
				transition: rotate var(--spring-hover-ms) var(--spring-hover);
			}

			@media (prefers-reduced-motion: no-preference) {
				:is(:hover, :focus-visible) > .theme-toggle-sun {
					rotate: 30deg;
				}

				:is(:hover, :focus-visible) > .theme-toggle-moon {
					rotate: -16deg;
				}
			}

			/* The wash spreads after the ink lands, like paint soaking into the paper. */
			.theme-toggle-wash {
				fill: var(--yellow);
				opacity: 0.75;
				mix-blend-mode: multiply;
				transform-origin: center;
				transform-box: fill-box;

				html[data-theme-switching] & {
					transition:
						scale 520ms 160ms ease-out,
						opacity 520ms 160ms ease-out;

					@starting-style {
						scale: 0.3;
						opacity: 0;
					}
				}

				html.dark & {
					opacity: 0.45;
					mix-blend-mode: normal;
				}
			}

			.theme-toggle-hatch {
				fill: none;
				stroke: currentColor;
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.75;
			}

			.theme-toggle-ink {
				fill: currentColor;
			}

			@media (prefers-reduced-motion: reduce) {
				html[data-theme-switching] .theme-toggle-wash {
					transition: none;
				}
			}
		</style>
	</svg>
}
