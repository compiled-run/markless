export {
	ToasterItem as item,
	ToasterItemClose as itemclose,
	ToasterItemDescription as itemdescription,
	ToasterItemIcon as itemicon,
	ToasterItemTitle as itemtitle,
	ToasterRoot as root,
	toasterItemState,
	// One message's instance, for a consumer whose own part sits inside an item.
	toasterItemState as itemstate,
	toasterState,
	toasterState as state,
} from './toaster.tsrx';
export {
	// The queue's arithmetic, exported because a consumer's own handler is where
	// a message is raised today: `toasts.queue = toaster.say(toasts.queue, ...)`.
	// See note.md - a `toasts.toast(...)` method call from a consumer module is
	// copied into the handler with neither its imports nor its graph wiring.
	dismiss as drop,
	say,
	// The visible cap, exported because the root renders no rows of its own: how
	// many messages show is the consumer's repeat to decide.
	shownSlice as shown,
} from './toaster-queue.ts';
export type {
	ToastOptions,
	ToastRecord,
	ToastTone,
	ToasterItemCloseProps,
	ToasterItemDescriptionProps,
	ToasterItemIconProps,
	ToasterItemProps,
	ToasterItemTitleProps,
	ToasterRootProps,
} from './toaster-types.ts';
