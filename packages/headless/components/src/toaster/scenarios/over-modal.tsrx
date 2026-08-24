import { modal, toaster } from '../../index.ts';

// A message raised while a dialog is open. The dialog takes the rest of the page
// out of reach; the region is a live region, so it has to stay reachable.
export default function OverModal() @{
	const toasts = toaster.state();

	<main>
		<modal.root data-testid="modal-root">
			<modal.trigger data-testid="modal-trigger">Open</modal.trigger>
			<modal.backdrop data-testid="modal-backdrop">
				<modal.content data-testid="modal-content">
					<modal.title data-testid="modal-title">Delete the file?</modal.title>
					<button
						type="button"
						data-testid="say"
						onClick={() => {
							toasts.queue = toaster.say(toasts.queue, 'Deleted', {
								id: 'deleted',
								duration: Infinity,
							});
						}}
					>Delete</button>
					<modal.close data-testid="modal-close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<toaster.root data-testid="root" />
	</main>
}
