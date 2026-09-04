// The bar across the top of every page: where you are, a search slot, the repo,
// and the space the theme toggle lands in. The trail and the titles come from
// `nav.ts` through `breadcrumbFor`, which is plain TypeScript, so the component
// itself carries no loop — `@for` still renders nothing on the document path
// (NOTES.md finding 3).
//
// Search is deliberately inert: there is no index to search yet.
//
// The theme toggle is not here. This component is composed from `document.tsrx`,
// and the router serves only the document's HTML and drops its state payload, so
// a `storage()` cell declared anywhere on the document path can never resume —
// the router now says so outright with
// MARKLESS_ROUTER_DOCUMENT_STORAGE_UNSUPPORTED. The toggle is therefore an island
// each page renders (`components/docs/theme-toggle.tsrx`), and `.theme-toggle-slot`
// is the width it is reserved here, at the end of the row, so the fixed control
// lands on it. NOTES.md finding 19 has the detail.
import Mascot from '../mascot.tsrx';
import { lucide } from '@markless/icons';
import { breadcrumbFor } from '../../nav.ts';
import VariantPicker from './variant-picker.tsrx';

export default function SiteHeader({ pathname }: { readonly pathname: string }) @{
	const crumb = breadcrumbFor(pathname);

	<header class="site-header">
		<a class="crumb crumb-home" href="/markless">
			<Mascot name="markless" size="1.7rem" variant="crumb" />
			<span>Markless</span>
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
				disabled="disabled"
			/>
			<a class="header-link" href="https://github.com/compiled-run/markless">GitHub</a>
			<VariantPicker pathname={pathname} />
			<span class="theme-toggle-slot" aria-hidden="true"></span>
		</div>
	</header>
}
