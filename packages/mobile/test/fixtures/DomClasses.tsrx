import { element, state } from '@markless/core';

function kindOf(target: Node | undefined): string {
	if (target instanceof HTMLInputElement) return 'a text field';
	if (target instanceof HTMLButtonElement) return 'a button';
	if (target instanceof SVGElement) return 'a drawing';
	if (target instanceof HTMLElement) return 'an element';
	return 'nothing';
}

function made(): string {
	try {
		return String(new HTMLElement());
	} catch (error) {
		return error instanceof TypeError ? 'not constructible' : 'constructible';
	}
}

export default function DomClasses() @{
	const field = element<HTMLInputElement>();
	const press = element<HTMLButtonElement>();
	const note = element<HTMLParagraphElement>();
	let seen = state('');
	<main>
		<input el={field} name="q" />
		<button el={press} onClick={() => (seen = kindOf(field))}>Field</button>
		<button onClick={() => (seen = kindOf(press))}>Button</button>
		<button onClick={() => (seen = kindOf(note))}>Note</button>
		<button onClick={() => (seen = made())}>Make</button>
		<p el={note}>{seen}</p>
	</main>
}
