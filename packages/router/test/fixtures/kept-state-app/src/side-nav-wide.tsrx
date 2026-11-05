import { computed, state } from '@markless/core';
import { Link } from '@markless/router';

export default function SideNavWide({ path }: { readonly path: string }) @{
	const nav = state({ open: false, count: 0 });
	const shown = computed(() => (nav.open ? 'open' : 'closed'));
	const here = computed(() => (path === '/about' ? 'About' : 'Other'));

	<aside class="side-nav side-nav-wide" data-side-nav>
		<p class="side-nav-note">{'This side navigation is the same on every page of the documentation and remembers what the reader opened.'}</p>
		<button type="button" data-toggle onClick={() => {
			nav.open = !nav.open;
			nav.count = nav.count + 1;
		}}>{'Show or hide the extra links of the side navigation'}</button>
		<span data-shown>{shown}</span>
		<span data-count>{nav.count}</span>
		<span data-here>{here}</span>
		<nav class="side-links" aria-label="Pages">
			<Link href="/guide" data-nav="guide">{'Guide'}</Link>
			<Link href="/reference" data-nav="reference">{'Reference'}</Link>
			<Link href="/about" data-nav="about">{'About'}</Link>
		</nav>
		<p class="side-nav-note">{'The about page renders a wider side navigation with one more element, so it is a different part.'}</p>
		<p class="side-nav-extra">{'Extra'}</p>
	</aside>
}
