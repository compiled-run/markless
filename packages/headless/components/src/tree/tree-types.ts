import type { PropsOf, Seeded } from '@markless/core';

/**
 * The tree container. It carries `role="tree"` and owns the one tab stop the
 * whole tree has, plus the typeahead buffer every row types into.
 *
 * The tree's accessible name comes through `{...rest}` as a plain `aria-label`:
 * naming it from `tree.label` would need an IDREF handle read on a widget root,
 * which is `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` today. See note.md.
 */
export type TreeRootProps = PropsOf<'div'> & {
	/** Nobody can open or close anything while this is set. */
	readonly disabled?: boolean;
};

/**
 * One node. A node that holds children renders a `tree.itemcontent` with more
 * `tree.item`s inside it, and each of those roots its own instance.
 */
export type TreeItemProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** This node's children are showing. Omit it and the node starts closed. */
	readonly open?: boolean;
	/**
	 * This node has no children. A leaf reports no open state at all, which is
	 * the WAI-ARIA rule a reader needs to tell "nothing to open" from "closed".
	 */
	readonly leaf?: boolean;
	/**
	 * How deep this node sits, counting from 1. It is written rather than read
	 * off the enclosing node, because a component that roots an instance of a
	 * family cannot also read the enclosing instance of that same family - see
	 * note.md, "Level is a prop".
	 */
	readonly level?: number;
	/** Called with the new state when a person opens or closes this node. */
	readonly onChange?: (open: boolean) => void;
};

/** The control that opens and closes one node. A consumer's `onClick` runs after. */
export type TreeItemTriggerProps = PropsOf<'button'>;

/** The tree's own heading. It does not name the tree; see `TreeRootProps`. */
export type TreeLabelProps = PropsOf<'span'>;

/**
 * The container of one node's children, `role="group"`. It stays in the page
 * when the node is closed - `hidden` decides whether it shows, never an arm -
 * so the ids inside it, the focus in it, and the widget instances under it all
 * survive a close.
 */
export type TreeItemContentProps = PropsOf<'div'>;

/** The node's name. The trigger points at it, and typeahead matches on it. */
export type TreeItemLabelProps = PropsOf<'span'>;

/** A decorative open/closed marker. It is hidden from the accessibility tree. */
export type TreeItemIndicatorProps = PropsOf<'span'>;

/**
 * The shared instance every part of one tree reads. It carries the root's one
 * seeded field and nothing else: which row holds the tab stop and what has been
 * typed at the tree both live on the container element, because the handlers
 * that maintain them sit on the element that roots this instance and cannot
 * read it. See note.md, "What the compiler forced".
 */
export type TreeInstanceState = Seeded<TreeRootProps, 'disabled'>;

/**
 * One rendered `tree.item`. Its own parts read this; the nodes inside its
 * content root their own instances of the same family and never see this one.
 */
export type TreeItemInstanceState = Seeded<TreeItemProps, 'open' | 'leaf' | 'level'> & {
	/** The consumer's callback, stored by the node for `toggle()` to call. */
	onChange?: TreeItemProps['onChange'];
};
