import type { Children } from '@markless/core';
import { state } from '@markless/core';

export default function Shell({ children }: { readonly children?: Children }) @{
	let presses = state(0);

	<section class="shell" data-shell>
		<p class="shell-note">{'Every page places its own content inside this shell, which keeps its own count of presses across an in-place navigation.'}</p>
		<p class="shell-note">{'The content inside it belongs to the page, so a navigation replaces it, and whatever state it had starts again from the next page.'}</p>
		<p class="shell-note">{'A shell this small would not be worth keeping, so this third note makes it long enough to keep, as a real layout would be.'}</p>
		<button type="button" data-shell-press onClick={() => presses++}>{`shell ${presses}`}</button>
		<div class="shell-body" data-shell-body>{children}</div>
	</section>
}
