export function Constructs({ value }: { value: string }) @{
	@/*M4_BODY*/
}

export function AfterIf({ value }: { value: string }) @{
	@if (value) { <span>{value}</span> } @/*M4_AFTER_IF*/
}

export function AfterFor({ value }: { value: string }) @{
	@for (const character of value) { <span>{character}</span> } @/*M4_AFTER_FOR*/
}

export function InSwitch({ value }: { value: string }) @{
	@switch (value) { @case 'x': { <span>x</span> } @/*M4_IN_SWITCH*/ }
}

export function AfterTry({ value }: { value: string }) @{
	@try { <span>{value}</span> } @/*M4_AFTER_TRY*/
}

export function Expression({ value }: { value: string }) @{
	const expression = value + @/*M4_EXPRESSION*/;
	<span>{expression}</span>
}

@/*M4_MODULE*/
