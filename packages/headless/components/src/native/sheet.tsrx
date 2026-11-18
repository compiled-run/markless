import type { SheetProps } from './sheet-types.ts';
import { closedByPlatform, presentDialog } from './present.ts';

export function NativeSheet({ open, onChange, dismissible, modal, children }: SheetProps) @{
	// onIdle starts the behaviour on a server-rendered page, where nothing inside the closed dialog can be pressed.
	<dialog
		attach={presentDialog(open, modal)}
		closedby={dismissible === false ? 'none' : 'any'}
		onIdle={() => {}}
		onCancel={(event) => {
			if (dismissible === false) event.preventDefault();
		}}
		onClose={(event) => {
			if (closedByPlatform(event.target)) onChange?.(false);
		}}
	>
		{children}
	</dialog>
}
