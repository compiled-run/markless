import { element, shared, state } from '@markless/core';

// One instance per rendered <Root>. Which message parts a consumer places is
// their call, so the control names both handles and the ones nothing rendered
// drop out of the attribute rather than dangling.
export const fieldState = shared(
	() => {
		const field = state({ invalid: false });
		const errorEl = element<HTMLParagraphElement>();
		const descriptionEl = element<HTMLParagraphElement>();
		return { ...field, errorEl, descriptionEl };
	},
	{ scope: 'widget' },
);

export function Root({ invalid = false, children }) @{
	const field = fieldState();
	field.invalid = invalid;

	<div data-field-root>{children}</div>
}

export function Control() @{
	const field = fieldState();

	<input data-field-control aria-describedby={[field.errorEl, field.descriptionEl]} />
}

export function ErrorText({ children }) @{
	const field = fieldState();

	<p data-field-error el={field.errorEl}>{children}</p>
}

export function Description({ children }) @{
	const field = fieldState();

	<p data-field-description el={field.descriptionEl}>{children}</p>
}
