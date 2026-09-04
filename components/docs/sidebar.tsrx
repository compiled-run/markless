// nav.ts is the single source for these links: the sidebar loops it, and the
// header's breadcrumb and the pager read the same file.
//
// Each entry carries three columns: the entry's own hand-drawn icon, its number
// inside the section, and the title, so the icons and numbers line up down the
// column. The icon is in the markup twice, light variant and dark variant, and
// CSS shows the one that matches the theme, because CSS cannot swap an `src`.
// An entry with no icon of its own on the sheet - the reference page, and every
// page of the UI section - keeps a crayon doodle instead, in the same two-cut
// shape.
//
// The list is inside a <details> so a phone gets one line of navigation instead
// of the whole column. It has no `open` attribute, so it is shut by default and the
// stylesheet opens it again above 70rem, where the column is beside the prose
// rather than on top of it.
//
// The mode-select slot is inert SSR markup. The live select is the final island
// each MDX page renders, because the router drops state from this document path
// (NOTES.md finding 19) and appending it cannot shift earlier island locators
// (finding 29). The link remains useful when JavaScript is unavailable.
import Mascot from '../mascot.tsrx';
import { modeFor, modes, sidebarFor } from '../../nav.ts';

export default function Sidebar({ pathname }: { readonly pathname: string }) @{
	const sections = sidebarFor(pathname);
	const here = modeFor(pathname);
	const framework = modes.framework;
	const library = modes.ui;
	const other = here.key === 'framework' ? library : framework;

	<nav class="sidebar" aria-label="Documentation">
		<a class="site-mark" href="/markless">
			<Mascot name="markless" size="3.4rem" variant="mark" />
			<span class="site-name">Markless</span>
		</a>
		<div class="mode-select-slot">
			<a class="mode-select-fallback" href={other.href}>Switch to {other.title}</a>
		</div>
		<details class="sidebar-disclosure">
			<summary class="sidebar-summary">All pages</summary>
			@for (const section of sections; key section.title) {
				<div class="sidebar-section">
					<p class={section.stroke ? 'sidebar-title has-stroke stroke-' + section.stroke : 'sidebar-title'}>
						{section.title}
					</p>
					<ul class="sidebar-list">
						@for (const entry of section.entries; key entry.href) {
							<li>
								<a
									class={entry.active ? 'sidebar-link is-active' : 'sidebar-link'}
									href={entry.href}
								>
									<span class="nav-icon">
										<img
											class="nav-icon-ink nav-icon-light"
											src={
												entry.icon
													? '/markless/sidebar/' + entry.icon + '-light.png'
													: '/markless/sprites/' + (entry.sprite ?? 'sparkle') + '.png'
											}
											alt=""
											aria-hidden="true"
											decoding="async"
										/>
										<img
											class="nav-icon-ink nav-icon-dark"
											src={
												entry.icon
													? '/markless/sidebar/' + entry.icon + '-dark.png'
													: '/markless/sprites/' + (entry.sprite ?? 'sparkle') + '.dark.png'
											}
											alt=""
											aria-hidden="true"
											decoding="async"
										/>
									</span>
									<span class="sidebar-num">{entry.number ?? ''}</span>
									<span class="sidebar-text">{entry.title}</span>
								</a>
							</li>
						}
					</ul>
				</div>
			}
		</details>
	</nav>
}
