import { element, shared, state } from '@markless/core';
import { focusBackToOpener, focusIntoSurface } from './modal-focus.ts';
import { armBackdropPress, isBackdropPressFinished } from './modal-press.ts';
import type {
	ModalBackdropProps,
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
			alert: false,
			isTriggerOpened: false,
		});
		const triggerEl = element<HTMLButtonElement>();
		const backdropEl = element<HTMLDivElement>();
		const contentEl = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();
		const closeEl = element<HTMLButtonElement>();

		return {
			...modal,
			triggerEl,
			backdropEl,
			contentEl,
			titleEl,
			descriptionEl,
			closeEl,
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

export function ModalRoot({
	open = false,
	alert = false,
	onChange,
	children,
	...rest
}: ModalRootProps) @{
	const modal = modalState();
	modal.onChange = onChange;
	modal.open = open;
	modal.alert = alert;

	<div
		{...rest}
		ui-open={modal.open}
		ui-closed={modal.open !== true}
	>{children}</div>
}

export function ModalTrigger({ children, onClick, ...rest }: ModalTriggerProps) @{
	const modal = modalState();

	<button
		{...rest}
		el={modal.triggerEl}
		type="button"
		aria-haspopup="dialog"
		aria-expanded={modal.open ? 'true' : 'false'}
		aria-controls={modal.contentEl}
		ui-open={modal.open}
		ui-closed={modal.open !== true}
		onClick={(event) => {
			modal.isTriggerOpened = true;
			modal.setOpen(true);
			focusIntoSurface(modal.contentEl, modal.closeEl, modal.alert);
			onClick?.(event);
		}}
	>{children}</button>
}

export function ModalBackdrop({
	children,
	onDismiss,
	onPointerdown,
	onPointerup,
	...rest
}: ModalBackdropProps) @{
	const modal = modalState();

	<div
		{...rest}
		overlay
		el={modal.backdropEl}
		hidden={modal.open !== true}
		ui-open={modal.open}
		ui-closed={modal.open !== true}
		onDismiss={(event) => {
			// Escape closes every dialog. An outside press is the one an alert
			// refuses, and the reports that reach here are presses landing beyond
			// the layer entirely - a press on the layer itself is the pair of
			// handlers below, because the behaviour counts its own element as inside.
			const isRefused = modal.alert === true && event.detail.reason === 'outside-press';
			if (isRefused !== true) {
				modal.setOpen(false);
				focusBackToOpener(modal.triggerEl, modal.backdropEl, modal.isTriggerOpened);
				modal.isTriggerOpened = false;
			}
			onDismiss?.(event);
		}}
		onPointerdown={(event) => {
			// A dismissal starts here and finishes on the click, so a drag that began
			// inside the dialog and ended on the layer never closes it.
			armBackdropPress(modal.backdropEl, event.target, event.button);
			onPointerdown?.(event);
		}}
		onPointerup={(event) => {
			// The release is what completes the dismissal. Reading it here rather than
			// on `click` keeps the whole gesture in the pointer vocabulary the press
			// began in, and a release outside the layer never reaches this handler.
			const isOutsidePress = isBackdropPressFinished(modal.backdropEl, event.target);
			if (isOutsidePress && modal.alert !== true) {
				modal.setOpen(false);
				focusBackToOpener(modal.triggerEl, modal.backdropEl, modal.isTriggerOpened);
				modal.isTriggerOpened = false;
			}
			onPointerup?.(event);
		}}
	>{children}</div>
}

export function ModalContent({ children, ...rest }: ModalContentProps) @{
	const modal = modalState();

	// `aria-modal` is authored, not toggled: the overlay behaviour reads it off
	// this subtree when the backdrop enlists, and that is what takes the rest of
	// the page out of reach. tabindex makes the surface itself a focus target,
	// which is where an opening dialog lands.
	<div
		{...rest}
		el={modal.contentEl}
		role={modal.alert ? 'alertdialog' : 'dialog'}
		aria-modal="true"
		aria-labelledby={modal.titleEl}
		aria-describedby={modal.descriptionEl}
		tabindex={-1}
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

	<button
		{...rest}
		el={modal.closeEl}
		type="button"
		onClick={(event) => {
			modal.setOpen(false);
			focusBackToOpener(modal.triggerEl, modal.backdropEl, modal.isTriggerOpened);
			modal.isTriggerOpened = false;
			onClick?.(event);
		}}
	>{children}</button>
}
