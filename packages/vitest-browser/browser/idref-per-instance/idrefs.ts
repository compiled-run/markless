const IDREF_ATTRIBUTES = ['aria-controls', 'aria-labelledby', 'aria-describedby'] as const;

/**
 * The `aria-valid-attr-value` bar, applied to every IDREF the page wrote.
 *
 * axe-core is not a dependency of this package, so the rule it applies to an
 * IDREF position is asserted directly: every id in an IDREF value has to resolve
 * to an element inside the rendered page.
 */
export function danglingIdrefs(container: ParentNode): string[] {
	const dangling: string[] = [];
	for (const host of container.querySelectorAll<HTMLElement>('*'))
		for (const attribute of IDREF_ATTRIBUTES) {
			const value = host.getAttribute(attribute);
			if (value === null) continue;
			if (value.trim() === '') {
				dangling.push(`${attribute}="" on ${host.tagName}`);
				continue;
			}
			for (const id of value.trim().split(/\s+/))
				if (!container.querySelector(`[id="${CSS.escape(id)}"]`))
					dangling.push(`${attribute}="${id}" on ${host.tagName} resolves to nothing`);
		}
	return dangling;
}
