import Mascot from '../mascot.tsrx';
import { lucide } from '@markless/ui';
import { breadcrumbFor } from '../../nav.ts';

export default function SiteHeader({ pathname }: { readonly pathname: string }) @{
	const crumb = breadcrumbFor(pathname);

	<header class="site-header">
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
