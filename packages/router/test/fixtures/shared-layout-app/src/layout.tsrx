import type { Children } from '@markless/core';
import { state } from '@markless/core';
import { Link } from '@markless/router';
import Banner from './banner.tsrx';

const SECTIONS = Array.from({ length: 60 }, (_, index) => index);

export default function Layout({ active, children }: { readonly active: string; readonly children?: Children }) @{
	let presses = state(0);

	<>
		<header class="top" data-header>
			<Link href="/alpha" data-top="alpha">Alpha</Link>
			<Link href="/beta" data-top="beta">Beta</Link>
			<button type="button" data-layout-press onClick={() => presses++}>{`pressed ${presses}`}</button>
			<input data-layout-field value={active} />
		</header>
		<aside class="side" data-sidebar>
			@for (const index of SECTIONS; key index) {
				<Link href={index % 2 === 0 ? '/alpha' : '/beta'} data-side={String(index)} data-active={String((index % 2 === 0 ? '/alpha' : '/beta') === active)}>{`Topic ${index}`}</Link>
			}
		</aside>
		<main data-main>
			<Banner />
			{children}
		</main>
	</>
}
