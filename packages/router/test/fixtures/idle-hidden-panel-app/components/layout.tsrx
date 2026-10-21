import { state } from '@markless/core';
import type { Children } from '@markless/core';
import { Notes } from './notes.tsrx';

// The page's frame, as an app shell is: its help panel stays hidden until asked for.
export function Layout({ children }: { readonly children?: Children }) @{
	let help = state(false);

	<div class="layout">
		<header>
			<button type="button" data-help aria-expanded={help ? 'true' : 'false'} onClick={() => (help = !help)}>Help</button>
		</header>
		<section data-help-panel hidden={!help}>
			<Notes />
		</section>
		<main>{children}</main>
	</div>
}
