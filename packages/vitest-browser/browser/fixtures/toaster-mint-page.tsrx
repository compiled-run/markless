import {
	item as ToasterItem,
	itemclose as ToasterItemClose,
	itemtitle as ToasterItemTitle,
	root as ToasterRoot,
	say,
	state as toasterState,
} from '../../../headless/components/src/toaster/index.ts';

// The real @markless/ui toaster, imported across a module boundary, with an EMPTY
// queue at serve time: every row on the page is one the client minted.
export function App() @{
	const toasts = toasterState();

	<main>
		<button
			data-say
			onClick={() => {
				toasts.queue = say(toasts.queue, 'Saved', {
					id: `t${toasts.queue.length + 1}`,
					tone: 'success',
				});
			}}
		>Say</button>
		<ToasterRoot data-region>
			@for (const message of toasts.queue; key message.id) {
				<ToasterItem toast={message}><ToasterItemTitle data-title /><ToasterItemClose data-close>x</ToasterItemClose></ToasterItem>
			}
		</ToasterRoot>
	</main>
}
