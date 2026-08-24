import type { PropsOf } from '@markless/core';

/** How a message is meant to read. `error` is the one a reader interrupts for. */
export type ToastTone = 'neutral' | 'success' | 'warning' | 'error';

/**
 * One message, as the queue holds it. Every field is a plain value: the array
 * lives in a `state()` cell, so a record has to survive being serialized into the
 * page and read back after resume.
 *
 * `dueAt` is when the message is next due to leave, in epoch milliseconds; `0`
 * means it never leaves, which is what `duration: Infinity` becomes. `remaining`
 * is what is left of its time while the stack is paused, and `0` while it runs.
 */
export type ToastRecord = {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly tone: ToastTone;
	/** The tone's own character, minted at enqueue so a row can read it as text. */
	readonly icon: string;
	readonly dueAt: number;
	readonly remaining: number;
};

/** What a caller may say about one message beyond its title. */
export type ToastOptions = {
	/** Say it again with the same id and the message already showing is updated. */
	readonly id?: string;
	readonly tone?: ToastTone;
	readonly description?: string;
	/** Milliseconds. `Infinity` keeps the message until something dismisses it. */
	readonly duration?: number;
};

/**
 * The region every message appears in. It is on the page before the first
 * message, because a live region added at the same moment as its text is not
 * announced.
 */
export type ToasterRootProps = PropsOf<'ol'> & {
	/** How many messages show at once. The rest wait their turn; none are dropped. */
	readonly visible?: number;
	/** Milliseconds each message shows for, unless it says otherwise. */
	readonly duration?: number;
};

/**
 * The cells every toaster part reads and writes. One graph per page.
 *
 * `visible` is deliberately absent: it is a prop of `toaster.root`, and a
 * page-scoped factory is never handed props (`MARKLESS_SHARED_SEED_UNKNOWN_FIELD`).
 * The showing slice is a cell of the root component instead.
 */
export type ToasterInstanceState = {
	queue: ToastRecord[];
	paused: boolean;
	pausedAt: number;
	/** How many messages have been minted, so an unnamed one gets its own id. */
	minted: number;
	/** The stack's one clock, or 0 while nothing is counting down. */
	ticker: number;
};

export type ToasterItemProps = PropsOf<'li'> & {
	/** The message this row shows. */
	readonly toast: ToastRecord;
	/** Where it stands in the stack: 0 is the front one. */
	readonly index?: number;
};

/** One instance per rendered `toaster.item`, read by the parts inside it. */
export type ToasterItemInstanceState = {
	id: string;
	title: string;
	description: string;
	tone: ToastTone;
	icon: string;
	index: number;
};

export type ToasterItemTitleProps = PropsOf<'div'>;
export type ToasterItemDescriptionProps = PropsOf<'div'>;
export type ToasterItemIconProps = PropsOf<'span'>;
/**
 * The button that dismisses the message it sits in. It takes no id: the item
 * around it holds one, the same way `select.itemindicator` reads its option.
 */
export type ToasterItemCloseProps = PropsOf<'button'>;
