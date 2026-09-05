import Mascot from '../mascot.tsrx';
import ModeSelect from './mode-select.tsrx';
import { modeFor, sidebarFor } from '../../nav.ts';

export default function Sidebar({ pathname }: { readonly pathname: string }) @{
	const sections = sidebarFor(pathname);
	const here = modeFor(pathname);

	<nav class="sidebar" aria-label="Documentation">
		<a class="site-mark" href="/markless">
			<Mascot name="markless" size="3.4rem" variant="mark" />
			<span class="site-name">Markless</span>
		</a>
		<ModeSelect mode={here.key} />
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
