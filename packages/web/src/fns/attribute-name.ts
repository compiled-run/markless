import { CAMEL_CASE_ATTRIBUTE_TOKENS } from '../camel-case-attribute-names.generated.ts';

let camelCaseAttributeNames: Map<string, string> | undefined;

/** The real attribute name a camelCase spelling such as `strokeWidth` stands for; any other name as written. */
export function marklessAttributeName(name: string): string {
	camelCaseAttributeNames ??= new Map(
		CAMEL_CASE_ATTRIBUTE_TOKENS.split(' ').map((token) =>
			/[-:]/.test(token)
				? [token.replace(/[-:]([a-z0-9])/g, (_, next: string) => next.toUpperCase()), token]
				: [token, token.toLowerCase()],
		),
	);
	return camelCaseAttributeNames.get(name) ?? name;
}
