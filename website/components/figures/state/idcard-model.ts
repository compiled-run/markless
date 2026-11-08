// The State object figure's values: the person on the ID card, which wire last carried a change, and what the live region says.
export const START = { name: 'Jack', age: 24 } as const;
export const NAMES = ['Jack', 'Ada', 'Grace', 'Alan'] as const;
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const nextName = (name: string) => NAMES[(NAMES.indexOf(name as (typeof NAMES)[number]) + 1) % NAMES.length]!;

export const PATHS = { name: 'person.name', age: 'person.age' } as const;

export function describeChange(field: 'name' | 'age', value: string | number): string {
	const other = field === 'age' ? 'name' : 'age';
	return `person.${field} is now ${value}. Only the ${field} wire carried it; the ${other} spot stayed as it was.`;
}
