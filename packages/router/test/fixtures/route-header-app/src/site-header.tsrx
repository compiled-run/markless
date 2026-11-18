import { Link } from '@markless/router';

export default function SiteHeader({ path }: { readonly path: string }) @{
	<header class="site-header" data-site-header>
		<a href="/" class="site-logo">{'Example documentation site with a long brand name'}</a>
		<nav class="site-nav" aria-label="Main">
			<Link href="/guide" class="site-link" data-nav="guide" data-active={path === '/guide' ? 'true' : 'false'}>{'Guide'}</Link>
			<Link href="/reference" class="site-link" data-nav="reference" data-active={path === '/reference' ? 'true' : 'false'}>{'Reference'}</Link>
			<Link href="/blog" class="site-link" data-nav="blog" data-active={path === '/blog' ? 'true' : 'false'}>{'Blog'}</Link>
		</nav>
		<div class="site-tools">
			<button type="button" class="site-search" data-search aria-haspopup="dialog">{'Search the documentation...'}</button>
			<span class="site-hint">{'Press the slash key anywhere on the page to start searching.'}</span>
		</div>
	</header>
}
