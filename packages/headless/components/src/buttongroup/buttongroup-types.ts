import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the arrow keys walk, and the axis `ui-vertical` reflects. */
export type ButtonGroupOrientation = 'horizontal' | 'vertical';

/**
 * What is pressed, in whichever shape the call site wrote it: one value for a
 * group that presses one item at a time, a list for a `multiple` group. Nothing
 * pressed is `''` or `[]`.
 */
export type ButtonGroupValue = string | readonly string[];

/**
 * A set of toggle buttons - text alignment, or bold/italic/underline. The group
 * is a `role="group"` element named by `buttongroup.label`, and every item
 * inside it is a real button reporting `aria-pressed`.
 *
 * Arrows move focus and never press: that is the whole difference from
 * `radiogroup`, where an arrow also chooses. Enter and Space press the focused
 * item, because the item is a button and the browser activates it.
 */
export type ButtonGroupRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The pressed value, or the pressed values when the group is `multiple`.
	 * Omit it and nothing is pressed.
	 */
	readonly value?: ButtonGroupValue;
	/** Any number of items may be pressed at once. Omit it and pressing one unpresses the rest. */
	readonly multiple?: boolean;
	/** Which axis the arrow keys walk. Omit it and the items run left to right. */
	readonly orientation?: ButtonGroupOrientation;
	/** Arrow past the last item and land on the first. Omit it and the ends stop. */
	readonly loop?: boolean;
	/** Nobody can press any item. */
	readonly disabled?: boolean;
	/**
	 * The group keeps at least one pressed item: pressing the last pressed one
	 * does nothing. Omit it and a person can leave the group with nothing pressed.
	 */
	readonly required?: boolean;
	/**
	 * The name every `buttongroup.itemfield` submits under, declared once here
	 * rather than repeated per item. Omit it and the group submits nothing.
	 */
	readonly name?: string;
	/**
	 * Intended to be called with what is pressed now - one value, or the whole
	 * list when the group is `multiple`, and `''` or `[]` once nothing is left
	 * pressed. The shape mirrors the shape `value` was written in. Omit it and
	 * pressing still works; the call site simply does nothing.
	 */
	readonly onChange?: (value: ButtonGroupValue) => void;
};

/** What `buttongroup.root` hands the group element it renders: everything it was given. */
export type ButtonGroupBoxProps = PropsOf<'div'>;

/** The group's name: the element `role="group"` points its `aria-labelledby` at. */
export type ButtonGroupLabelProps = PropsOf<'label'>;

/**
 * One toggle button. A real `<button aria-pressed>`, not a switch: a switch is a
 * setting that takes effect at once, which is what `toggle` is for, while this
 * is a control a person presses on and off inside a set.
 *
 * The button's own content is its accessible name, so it takes label content and
 * needs no label part. A consumer's `onClick`, `onFocus` and `onKeydown` all run
 * after the family's.
 */
export type ButtonGroupItemProps = PropsOf<'button'> & {
	/** What this item contributes to the group's value. Required: position is never identity. */
	readonly value: string;
	/** Nobody can press this item, and the arrow keys walk past it. */
	readonly disabled?: boolean;
};

/**
 * The hidden input that carries one pressed item into a form. Written inside the
 * item whose value it submits, it takes no configuration of its own: `name`
 * comes from `buttongroup.root` and `value` from `buttongroup.item`, so one
 * place decides what a form receives. It is in the page only while its item is
 * pressed, which is what makes a `multiple` group submit its name once per
 * pressed value with no special handling.
 */
export type ButtonGroupItemFieldProps = PropsOf<'input'>;

/**
 * The shared instance every group part reads and writes: the root's seeded
 * fields, plus what no prop carries - `focused`, the value of the item holding
 * the group's roving tab stop, and the consumer's `onChange`, stored by the root
 * for `toggle()`.
 *
 * `value` holds whichever shape the consumer wrote, and whichever shape the last
 * press wrote over it, because a shared cell is seeded from a bare prop and
 * nothing else. Read it through `heldValues`, never raw.
 */
export type ButtonGroupInstanceState = Seeded<
	ButtonGroupRootProps,
	'value' | 'multiple' | 'orientation' | 'loop' | 'disabled' | 'required' | 'name'
> & {
	focused: string;
	onChange?: ButtonGroupRootProps['onChange'];
};

/**
 * One instance per rendered `buttongroup.item`, holding that item's own value
 * and whether it is locked. The parts inside an item read this rather than the
 * group, which is how an item's hidden field knows what to submit.
 */
export type ButtonGroupItemInstanceState = Seeded<ButtonGroupItemProps, 'value' | 'disabled'>;
