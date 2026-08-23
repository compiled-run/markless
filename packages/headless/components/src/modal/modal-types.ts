import type { PropsOf, Seeded } from '@markless/core';

/**
 * Why the overlay behaviour reported a dismissal.
 *
 * The vocabulary is owned by `OverlayDismissReason` in
 * `packages/web/src/fns/overlay.ts` and is restated here only because
 * `@markless/ui` does not depend on `@markless/web`; see note.md.
 */
export type ModalDismissReason = 'escape' | 'outside-press';

/** The event the overlay behaviour delivers on the enlisted backdrop. */
export type ModalDismissEvent = CustomEvent<{ readonly reason: ModalDismissReason }>;

// `dismiss` is a real DOM event the overlay behaviour dispatches, so it belongs
// in the DOM event map: that is what gives every element an `onDismiss` the
// compiler already lowers. The declaration lives here because the intrinsic
// element types are owned by the typescript-plugin, which this family does not
// edit; note.md records it as a home to revisit.
declare global {
	interface GlobalEventHandlersEventMap {
		dismiss: ModalDismissEvent;
	}
}

export type ModalRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the dialog is showing. Omit it and the dialog starts closed. */
	readonly open?: boolean;
	/**
	 * An alert dialog: it announces as `alertdialog`, it refuses to close on an
	 * outside press, and opening it puts focus on the close control rather than
	 * on the surface. Escape still closes it.
	 */
	readonly alert?: boolean;
	/**
	 * Called with the new value when the dialog opens or closes - including when
	 * a dismissal closes it. Omit it and the dialog still opens and closes; the
	 * call site simply does nothing.
	 */
	readonly onChange?: (open: boolean) => void;
};

/** A consumer's `onClick` runs after the dialog has opened. */
export type ModalTriggerProps = PropsOf<'button'>;

/** A consumer's `onClick` runs after the dialog has closed. */
export type ModalCloseProps = PropsOf<'button'>;

/**
 * The dimming layer, and the element that is actually elevated: it carries the
 * `overlay` mark, the `hidden` gating, and the dismissal reports the overlay
 * behaviour delivers. It wraps `modal.content` rather than sitting beside it,
 * so styling the layer and the dialog together is ordinary nesting.
 *
 * A consumer's `onDismiss` runs after the family has applied its own policy, so
 * a handler can see which way the family went.
 */
export type ModalBackdropProps = PropsOf<'div'>;

/**
 * The dialog surface. It stays in the page when the modal is closed - `hidden`
 * on the backdrop decides whether it shows, never an arm - because the overlay
 * behaviour marks the background off an attached element and unmarks it the
 * same way. A surface that detaches while showing leaves the rest of the page
 * inert with nothing left to unmark it.
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
export type ModalInstanceState = Seeded<ModalRootProps, 'open' | 'alert'> & {
	onChange?: ModalRootProps['onChange'];
};
