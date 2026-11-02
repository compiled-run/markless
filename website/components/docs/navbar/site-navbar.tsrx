import { state } from '@markless/core';
import { lucide, modal, navbar } from '@markless/ui';
import { asset } from '../../../site-base.ts';
import { INK_MARKS } from '../ink-marks.ts';
import ThemeToggle from '../theme-toggle.tsrx';
import { getStarted, github, isCurrent, NAV_DECOR, type NavCard, panels } from './sections.ts';

/** The site's header: a floating bar of three panels on a wide screen, a top bar and a full-screen menu on a narrow one. */
export default function SiteNavbar({ pathname }: { readonly pathname: string }) @{
	<header class="site-navbar">
		<MobileMenu pathname={pathname} />
		<DesktopNav pathname={pathname} />

		<style>
			.site-navbar {
				position: relative;
				z-index: 60;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 1rem;
				line-height: 1.5;
				color: var(--ink);
			}
		</style>
	</header>
}

function Brand({ compact }: { readonly compact?: boolean }) @{
	<span class={compact ? 'brand brand-compact' : 'brand'}>
		<svg class="brand-mug" viewBox="0 0 108 108" aria-hidden="true">
			<use href={asset(INK_MARKS) + '#markless-mug'} />
		</svg>
		<span class="brand-name">Markless</span>

		<style>
			.brand {
				display: inline-flex;
				align-items: center;
				gap: 0.45rem;
			}

			.brand-mug {
				inline-size: 1.9rem;
				block-size: 1.9rem;
				overflow: visible;
				translate: 0 -0.1rem;
			}

			.brand-name {
				font-family: 'Joy Elia', 'Shantell Sans', system-ui, sans-serif;
				font-size: 1.6rem;
				font-weight: 700;
				line-height: 1;
			}

			.brand-compact .brand-name {
				font-size: 1.35rem;
			}
		</style>
	</span>
}

function DesktopNav({ pathname }: { readonly pathname: string }) @{
	const homepage = pathname === '/';

	<div class="nav-shade">
		<navbar.root class="nav-pill navbar-edge" aria-label="Main" data-scroll-hide={homepage ? undefined : ''}>
			<navbar.itemlink class="brand-link" href="/" current={homepage}>
				<Brand />
			</navbar.itemlink>
			<div class="nav-items">
				@for (const top of panels; key top.label) {
					<NavDropdown label={top.label} pathname={pathname} />
				}
			</div>
			<div class="nav-tools">
				<navbar.itemlink class="tool-link" href={github} aria-label="Markless on GitHub">
					<lucide.github class="tool-icon" aria-hidden="true" />
				</navbar.itemlink>
				<ThemeToggle inBar />
				<navbar.item value="get-started">
					<navbar.itemlink class="cta" href={getStarted} current={isCurrent(pathname, getStarted)}>
						<span>Get started</span>
						<lucide.arrowright class="cta-arrow" aria-hidden="true" />
					</navbar.itemlink>
				</navbar.item>
			</div>
		</navbar.root>

		<style>
			.nav-shade {
				display: none;
			}

			/* A wide screen floats the bar over the prose, with room beside the sidebar. */
			@media (min-width: 80rem) {
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
				background: color-mix(in oklch, var(--ink) 38%, transparent);
				opacity: 0;
				transition: opacity 500ms ease;

				html.dark & {
					background: color-mix(in oklch, black 62%, transparent);
				}
			}

			.nav-shade:has([ui-open])::before {
				opacity: 1;
			}

			.nav-pill {
				position: fixed;
				top: 1.5rem;
				left: 50%;
				z-index: 60;
				box-sizing: border-box;
				display: flex;
				align-items: center;
				justify-content: space-between;
				inline-size: 100%;
				max-inline-size: 42rem;
				block-size: 4.375rem;
				padding-inline: 1.5rem 0.9rem;
				border: 2px solid var(--ink);
				border-radius: 1rem;
				background: var(--raised);
				box-shadow: 6px 6px 0 var(--muted-ink);
				translate: -50% 0;
				transition:
					translate 300ms ease,
					opacity 300ms ease;
			}

			/* public/navbar-scroll.js marks the page while the reader scrolls down it; focus brings the bar back. */
			html[data-nav-away] .nav-pill[data-scroll-hide]:not([ui-open]) {
				translate: -50% calc(-100% - 1.5rem);
				opacity: 0;
			}

			.brand-link {
				display: inline-flex;
				align-items: center;
				color: var(--ink);
				text-decoration: none;
				border-radius: 6px;
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

			.cta {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				margin-inline-start: 0.4rem;
				padding: 0.35rem 0.85rem;
				border: 2px solid var(--ink);
				border-radius: 8px 10px 8px 11px;
				background: var(--pink);
				color: var(--on-accent);
				font-weight: 700;
				font-size: 0.95rem;
				text-decoration: none;
				white-space: nowrap;
				box-shadow: 3px 3px 0 var(--ink);
				transition:
					translate 140ms ease,
					box-shadow 140ms ease;
			}

			.cta:hover {
				translate: -1px -1px;
				box-shadow: 4px 4px 0 var(--ink);
			}

			.cta:active {
				translate: 2px 2px;
				box-shadow: 1px 1px 0 var(--ink);
			}

			.cta-arrow {
				inline-size: 1rem;
				block-size: 1rem;
			}

			:is(.brand-link, .tool-link, .cta):focus-visible {
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

function NavDropdown({ label, pathname }: { readonly label: string; readonly pathname: string }) @{
	const dropdown = panels.find((candidate) => candidate.label === label) ?? panels[0]!;

	<navbar.item class="nav-item" value={dropdown.label} active={dropdown.cards.some((linked) => isCurrent(pathname, linked.href))}>
		<navbar.itemtrigger class="nav-trigger">
			<span>{dropdown.label}</span>
		</navbar.itemtrigger>
		<navbar.itemcontent class={'nav-panel nav-panel-' + dropdown.layout}>
			@for (const card of dropdown.cards; key card.label) {
				<NavCardLink href={card.href} label={card.label} description={card.description} art={card.art} size={card.size} pathname={pathname} />
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

			.nav-item[ui-active] .nav-trigger span {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 0.12em;
				text-underline-offset: 0.2em;
			}

			/* The bar's translate makes it this panel's containing block, so the offsets are from the bar's padding box. */
			.nav-panel {
				position: fixed;
				top: calc(100% + 1rem + 2px);
				left: 50%;
				z-index: 60;
				box-sizing: border-box;
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 1rem;
				inline-size: 42rem;
				margin: 0;
				padding: 1rem;
				border: 2px solid var(--ink);
				border-radius: 1rem;
				background: var(--raised);
				box-shadow: 6px 6px 0 var(--muted-ink);
				translate: -50% 0;
				opacity: 1;
				transition:
					opacity 325ms ease-in-out,
					display 325ms allow-discrete;

				@starting-style {
					opacity: 0;
				}
			}

			.nav-panel[hidden] {
				display: none;
				opacity: 0;
			}

			.nav-panel-pair {
				grid-template-rows: max-content;
			}

			.nav-panel-stack {
				grid-template-rows: max-content max-content;
			}

			@media (prefers-reduced-motion: reduce) {
				.nav-panel {
					transition: none;
				}
			}
		</style>
	</navbar.item>
}

function NavCardLink({
	href,
	label,
	description,
	art,
	size,
	pathname,
}: {
	readonly href: NavCard['href'];
	readonly label: string;
	readonly description: string;
	readonly art: NavCard['art'];
	readonly size: NavCard['size'];
	readonly pathname: string;
}) @{
	<navbar.itemlink class={'card card-' + size} href={href} current={isCurrent(pathname, href)}>
		<svg class="card-art" viewBox={size === 'short' ? '0 0 276 128' : '0 0 276 280'} preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
			<use href={asset(NAV_DECOR) + '#' + art} />
		</svg>
		<span class="card-text">
			<span class="card-label">{label}</span>
			<span class="card-note">{description}</span>
		</span>

		<style>
			.card {
				position: relative;
				display: flex;
				flex-direction: column;
				overflow: hidden;
				border: 2px solid var(--ink);
				border-radius: 0.6rem;
				background: var(--paper);
				color: var(--ink);
				text-decoration: none;
				--decor-wash: var(--yellow);
				--decor-wash-opacity: 0.75;
				--decor-wash-blend: multiply;

				html.dark & {
					--decor-wash-opacity: 0.4;
					--decor-wash-blend: normal;
				}
			}

			.card-tall {
				grid-row: 1 / 3;
			}

			.card-short {
				grid-column: 2;
			}

			.card-art {
				display: block;
				inline-size: 100%;
				block-size: 17.5rem;
				transition: scale 300ms ease;
				will-change: transform;
			}

			.card-short .card-art {
				block-size: 8rem;
			}

			.card:hover .card-art,
			.card:focus-visible .card-art {
				scale: 1.05;
			}

			.card:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			/* The label sits on a fade of the card's own paper, the way QDS sets white type over a dark gradient. */
			.card-text {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				display: flex;
				flex-direction: column;
				padding: 1.6rem 0.6rem 0.5rem;
				background: linear-gradient(to top, var(--paper) 0%, var(--paper) 45%, transparent 100%);
				pointer-events: none;
			}

			.card-short .card-text {
				inset-inline-end: 38%;
				top: 0;
				justify-content: flex-end;
				padding-top: 0.5rem;
				background: linear-gradient(to right, var(--paper) 0%, var(--paper) 60%, transparent 100%);
			}

			.card-label {
				font-weight: 700;
				line-height: 1.3;
			}

			.card-note {
				font-size: 0.85rem;
				line-height: 1.35;
				color: color-mix(in oklch, var(--ink) 72%, var(--paper));
			}

			.card[ui-active] .card-label {
				justify-self: start;
				align-self: flex-start;
				padding-inline: 0.2em;
				margin-inline-start: -0.2em;
				background: var(--yellow);
				color: var(--on-accent);
				border-radius: 3px 5px 3px 6px;
			}

			@media (prefers-reduced-motion: reduce) {
				.card-art {
					transition: none;
				}
			}
		</style>
	</navbar.itemlink>
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
				<a class="bar-brand" href="/" aria-label="Markless home">
					<Brand compact />
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
						<a class="bar-brand" href="/" aria-label="Markless home">
							<Brand compact />
						</a>
						<modal.close class="bar-button" aria-label="Close menu">
							<lucide.x class="bar-icon" aria-hidden="true" />
						</modal.close>
					</div>

					<div class="menu-body">
						<div class="menu-grid">
							@for (const section of panels; key section.label) {
								<div class="menu-section">
									<span class="menu-heading">{section.label}</span>
									@for (const link of section.cards; key link.href) {
										<a
											class={!link.skipActive && isCurrent(pathname, link.href) ? 'menu-link menu-link-current' : 'menu-link'}
											href={link.href}
											aria-current={!link.skipActive && isCurrent(pathname, link.href) ? 'page' : undefined}
										><span class="menu-link-text">{link.label}</span></a>
									}
								</div>
							}
							<div class="menu-section">
								<span class="menu-heading">More</span>
								<a class="menu-link" href={github}><span class="menu-link-text">GitHub</span></a>
							</div>
						</div>
						<a class="menu-cta" href={getStarted}>
							<span>Get started</span>
							<lucide.arrowright class="cta-arrow" aria-hidden="true" />
						</a>
					</div>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<style>
			.mobile-nav {
				display: block;
			}

			@media (min-width: 80rem) {
				.mobile-nav {
					display: none;
				}
			}

			.mobile-bar {
				position: fixed;
				inset-block-start: 0;
				inset-inline: 0;
				z-index: 60;
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

			.menu-link-current {
				border-bottom-color: var(--pink);
			}

			.menu-link-current .menu-link-text {
				padding-inline: 0.2em;
				margin-inline-start: -0.2em;
				background: var(--yellow);
				color: var(--on-accent);
				border-radius: 3px 5px 3px 6px;
			}

			.menu-cta {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				margin-block-start: 2rem;
				padding: 0.35rem 0.85rem;
				border: 2px solid var(--ink);
				border-radius: 8px 10px 8px 11px;
				background: var(--pink);
				color: var(--on-accent);
				font-size: 0.875rem;
				font-weight: 700;
				text-decoration: none;
				box-shadow: 3px 3px 0 var(--ink);
			}

			.menu-cta .cta-arrow {
				inline-size: 1rem;
				block-size: 1rem;
			}

			:is(.bar-button, .bar-brand, .menu-link, .menu-cta):focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}
		</style>
	</div>
}
