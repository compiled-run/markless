import { shared, state } from '@markless/core';

// A sheet the page opens through a prop and the sheet closes itself, reporting
// the close through the consumer's callback.
export const sheetState = shared(
	() => {
		const sheet = state({ shown: false });

		return {
			...sheet,
			onShownChange: undefined as ((shown: boolean) => void) | undefined,
			dismiss() {
				const shown = sheet.shown;
				if (shown !== true) return;
				sheet.shown = false;
				sheet.onShownChange?.(false);
			},
		};
	},
	{ scope: 'widget' },
);

export function SheetRoot({ shown = false, onShownChange, children }) @{
	const sheet = sheetState();
	sheet.onShownChange = onShownChange;
	sheet.shown = shown;

	<aside data-sheet ui-shown={sheet.shown}>{children}</aside>
}

export function SheetBody({ children }) @{
	const sheet = sheetState();

	<div data-sheet-body hidden={sheet.shown !== true}>{children}</div>
}

export function SheetDismiss({ children }) @{
	const sheet = sheetState();

	<button type="button" data-sheet-dismiss onClick={() => sheet.dismiss()}>{children}</button>
}
