import type { Children, PropsOf } from '@markless/core';
import type { SingleHandler } from '../handler-props.ts';

export type TextboxRootProps = PropsOf<'div'> & {
	/** The text the box shows. Omit it and the box starts empty. */
	readonly value?: string;
	readonly disabled?: boolean;
	readonly required?: boolean;
	readonly readonly?: boolean;
	/** Submitted under this name by whichever trigger the family renders. */
	readonly name?: string;
	/**
	 * Called with the new text as a person types. Omit it and the box still works;
	 * the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
	readonly children?: Children;
};

/**
 * The control a person types into. `disabled`, `required` and `readonly` may be
 * set here as well as on the root, and a restriction set in either place stands:
 * a part can add a restriction, never remove one.
 */
export type TextboxTriggerProps = Omit<PropsOf<'input'>, 'onInput'> & {
	/** Called after the box's own text has moved with the person's keystroke. */
	readonly onInput?: SingleHandler<PropsOf<'input'>['onInput']>;
};

/** The same control over more than one line. */
export type TextboxMultilineTriggerProps = Omit<PropsOf<'textarea'>, 'onInput'> & {
	readonly onInput?: SingleHandler<PropsOf<'textarea'>['onInput']>;
};

export type TextboxLabelProps = PropsOf<'label'> & {
	readonly children?: Children;
};

export type TextboxDescriptionProps = PropsOf<'div'> & {
	readonly children?: Children;
};

export type TextboxErrorProps = PropsOf<'div'> & {
	readonly children?: Children;
};
