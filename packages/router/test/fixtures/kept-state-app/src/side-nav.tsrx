import { computed, state } from '@markless/core';
import { Link } from '@markless/router';

export default function SideNav({ path }: { readonly path: string }) @{
	const nav = state({ open: false, count: 0, pinned: path === '/reference' });
	const shown = computed(() => (nav.open ? 'open' : 'closed'));
	const here = computed(() => (path === '/guide' ? 'Guide' : 'Reference'));
	const pin = computed(() => (nav.pinned ? 'pinned' : 'loose'));
	const marked = computed(() => (nav.open ? 'open ' : '') + (path === '/guide' ? 'guide' : 'reference'));

	<aside class="side-nav" data-side-nav data-marked={marked}>
		<p class="side-nav-note">{'This side navigation is the same on every page of the documentation and remembers what the reader opened.'}</p>
		<button type="button" data-toggle onClick={() => {
			nav.open = !nav.open;
			nav.count = nav.count + 1;
		}}>{'Show or hide the extra links of the side navigation'}</button>
		<span data-shown>{shown}</span>
		<span data-count>{nav.count}</span>
		<span data-here>{here}</span>
		<span data-pin>{pin}</span>
		<nav class="side-links" aria-label="Pages">
			<Link href="/guide" data-nav="guide">{'Guide'}</Link>
			<Link href="/reference" data-nav="reference">{'Reference'}</Link>
			<Link href="/about" data-nav="about">{'About'}</Link>
		</nav>
		<p class="side-nav-note">{'Every page renders this part in the same place, so an in-place navigation keeps it as it is.'}</p>
	</aside>
}
