export function Constructs({ value }: { value: string }) @{
	@/*M4_BODY*/
	@if (value) { <span>{value}</span> } @/*M4_AFTER_IF*/
	@for (const character of value) { <span>{character}</span> } @/*M4_AFTER_FOR*/
	@switch (value) { @case 'x': { <span>x</span> } @/*M4_IN_SWITCH*/ }
	@try { <span>{value}</span> } @/*M4_AFTER_TRY*/
	const expression = value + @/*M4_EXPRESSION*/;
}

@/*M4_MODULE*/
