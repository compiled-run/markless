/** What `close()` sets as `returnValue` when the page's own state closed the dialog, so `close` does not report it. */
export const CLOSED_BY_PAGE = 'page';

/** Follows the page's `open` state: the top layer while true, closed while false. */
export const presentDialog = (open: boolean | undefined, modal: boolean | undefined) => (dialog: HTMLDialogElement) => {
	if (open && !dialog.open) {
		dialog.returnValue = '';
		if (modal !== false) dialog.showModal();
		else dialog.show();
	} else if (!open && dialog.open) dialog.close(CLOSED_BY_PAGE);
};

/** Whether a `close` event came from the platform (Escape, a press outside) rather than from the page. */
export const closedByPlatform = (dialog: EventTarget | null): boolean =>
	(dialog as HTMLDialogElement | null)?.returnValue !== CLOSED_BY_PAGE;
