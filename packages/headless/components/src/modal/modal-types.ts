import type { PropsOf, Seeded } from '@markless/core';

export type ModalRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the dialog is showing. Omit it and the dialog starts closed. */
	readonly open?: boolean;
	/**
	 * Called with the new value when the dialog opens or closes - including when
	 * Escape closes it. Omit it and the dialog still opens and closes; the call
	 * site simply does nothing.
	 */
	readonly onChange?: (open: boolean) => void;
};

/** A consumer's `onClick` runs after the dialog has opened. */
export type ModalTriggerProps = PropsOf<'button'>;

/** A consumer's `onClick` runs after the dialog has closed. */
export type ModalCloseProps = PropsOf<'button'>;

/**
 * The dialog surface. It stays in the page when the modal is closed - `hidden`
 * decides whether it shows, never an arm - because the overlay primitive marks
 * the background off an attached surface and unmarks it the same way. A surface
 * that detaches while open leaves the rest of the page inert with nothing left
 * to unmark it.
 */
export type ModalContentProps = PropsOf<'div'>;

/** The dialog's name. Mounting it is what names the surface. */
export type ModalTitleProps = PropsOf<'h2'>;

/** A sentence the reader announces after the name. */
export type ModalDescriptionProps = PropsOf<'p'>;

/**
 * The shared instance every modal part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `setOpen()` to
 * call.
 */
export type ModalInstanceState = Seeded<ModalRootProps, 'open'> & {
	onChange?: ModalRootProps['onChange'];
};
