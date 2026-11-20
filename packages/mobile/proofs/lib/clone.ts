export type Values = { readonly name: string; readonly tags: string[]; readonly when: Date };

export function withCheck(values: Values): Values {
	const own = structuredClone(values);
	own.tags.push('checked');
	return own;
}
