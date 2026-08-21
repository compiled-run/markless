import type { Children, PropsOf } from '@markless/core';
import type { CallableHandler } from '../handler-props.ts';

export type TextboxRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The text the box shows. Omit it and the box starts empty. */
	readonly value?: string;
	readonly disabled?: boolean;
	readonly required?: boolean;
	readonly readonly?: boolean;
	/** Submitted under this name by whichever control the family renders. */
	readonly name?: string;
	/**
	 * Called with the new text as a person types. Omit it and the box still works;
	 * the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
};

/**
 * The control a person types into. `disabled`, `required` and `readonly` may be
 * set here as well as on the root, and a restriction set in either place stands:
 * a part can add a restriction, never remove one.
 */
export type TextboxInputProps = Omit<PropsOf<'input'>, 'onInput'> & {
	/** Called after the box's own text has moved with the person's keystroke. */
	readonly onInput?: CallableHandler<PropsOf<'input'>['onInput']>;
};

/** The same control over more than one line. */
export type TextboxTextareaProps = Omit<PropsOf<'textarea'>, 'onInput'> & {
	readonly onInput?: CallableHandler<PropsOf<'textarea'>['onInput']>;
};

export type TextboxLabelProps = PropsOf<'label'>;

export type TextboxDescriptionProps = PropsOf<'div'>;

export type TextboxErrorProps = PropsOf<'div'>;
