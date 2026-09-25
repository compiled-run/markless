import { Link } from '@markless/router';

const pages = Array.from({ length: 40 }, (_, index) => index);

export default function Side({ current }: { readonly current: string }) @{
	<nav class="side" data-side style="position: fixed; top: 40px; left: 0; width: 180px; height: 300px; overflow: auto">
		<Link href="/" data-side-link="home" aria-current={current === '/' ? 'page' : undefined}>Home</Link>
		<Link href="/alpha" data-side-link="alpha" aria-current={current === '/alpha' ? 'page' : undefined}>Alpha</Link>
		@for (const index of pages; key index) {
			<p style="height: 30px; margin: 0">{`filler ${index}`}</p>
		}
		<Link href="/beta" data-side-link="beta" aria-current={current === '/beta' ? 'page' : undefined}>Beta</Link>
	</nav>
}
