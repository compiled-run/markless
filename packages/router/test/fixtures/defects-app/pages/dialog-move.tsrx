import { state } from '@markless/core';
import { portalToContainerEnd } from '../src/portal.ts';

export default function DialogMovePage() @{
	let open = state(false);
	let shown = state(0);
	<main>
		<button data-open onClick={() => {
			open = true;
			portalToContainerEnd(document.querySelector('[data-content]') as HTMLElement);
		}}>{'open'}</button>
		<div data-content data-state={open ? 'open' : 'closed'} hidden onVisible={() => shown++}>
			<span data-shown>{shown}</span>
			<button data-close onClick={() => (open = false)}>{'close'}</button>
		</div>
		<p data-after>{open ? 'after open' : 'after closed'}</p>
	</main>;
}
