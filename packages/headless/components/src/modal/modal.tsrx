import { element, shared, state } from '@markless/core';
import { closeOverlay, openOverlay } from '@markless/web/fns/overlay';
import type {
	ModalCloseProps,
	ModalContentProps,
	ModalDescriptionProps,
	ModalInstanceState,
	ModalRootProps,
	ModalTitleProps,
	ModalTriggerProps,
} from './modal-types.ts';

export const modalState = shared(
	() => {
		const modal: ModalInstanceState = state({
			open: false,
		});
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();

		return {
			...modal,
			triggerEl,
			contentEl,
			titleEl,
			descriptionEl,
			onChange: undefined as ((open: boolean) => void) | undefined,
			setOpen(next: boolean) {
				if (modal.open === next) return;
				modal.open = next;
				modal.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function ModalRoot({ open = false, onChange, children, ...rest }: ModalRootProps) @{
	const modal = modalState();
	modal.onChange = onChange;
	modal.open = open;

	<div
		{...rest}
		ui-open={modal.open}
		ui-closed={modal.open !== true}
	>{children}</div>
}

export function ModalTrigger({ children, onClick, ...rest }: ModalTriggerProps) @{
	const modal = modalState();

	// aria-haspopup="dialog" and no aria-expanded: a dialog is not a disclosure,
	// and Base UI, Radix and Kobalte all omit expanded here too.
	<button
		{...rest}
		el={modal.triggerEl}
		type="button"
		aria-haspopup="dialog"
		onClick={(event) => {
			modal.setOpen(true);
			// A plain statement, never an assignment's value side: a handle read there
			// lowers to a graph read. No onDismiss - a function read off the instance is
			// not lowered inside a handler module, in any spelling measured (note.md).
			openOverlay(modal.contentEl, {
				kind: 'modal',
				trigger: modal.triggerEl,
			});
			onClick?.(event);
		}}
	>{children}</button>
}

export function ModalContent({ children, ...rest }: ModalContentProps) @{
	const modal = modalState();

	// role="dialog" on an ordinary element rather than <dialog>: the top layer
	// takes the surface out of reach of the consumer's own animations, and the
	// overlay primitive supplies what showModal() would have - focus containment,
	// Escape, an inert background, aria-modal and the scroll lock.
	//
	// Closed hides the surface, never detaches it: the primitive unmarks the
	// background through this element, and a detached surface strands those marks.
	<div
		{...rest}
		el={modal.contentEl}
		role="dialog"
		aria-labelledby={modal.titleEl}
		aria-describedby={modal.descriptionEl}
		hidden={modal.open !== true}
		ui-open={modal.open}
		ui-closed={modal.open !== true}
	>{children}</div>
}

export function ModalTitle({ children, ...rest }: ModalTitleProps) @{
	const modal = modalState();

	<h2 {...rest} el={modal.titleEl}>{children}</h2>
}

export function ModalDescription({ children, ...rest }: ModalDescriptionProps) @{
	const modal = modalState();

	<p {...rest} el={modal.descriptionEl}>{children}</p>
}

export function ModalClose({ children, onClick, ...rest }: ModalCloseProps) @{
	const modal = modalState();

	// Closing goes through the primitive as well as through state: releasing the
	// stack entry is what unmarks the background and hands focus back to the
	// trigger, and a state flip alone would do neither.
	<button
		{...rest}
		type="button"
		onClick={(event) => {
			modal.setOpen(false);
			closeOverlay(modal.contentEl);
			onClick?.(event);
		}}
	>{children}</button>
}
