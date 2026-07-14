export function identity<T>(value: T): T {
	return value;
}

export function TypeScriptCapabilities() @{
	const element = document.createElement('div');
	document./*M3_DOM*/;
	[1, 2, 3]./*M3_STDLIB*/;
	iden/*M3_LOCAL*/;
	identity/*M3_GENERIC*/('typed');
	const deliberateTypeError: number = 'mapped-error';/*M3_DIAGNOSTIC*/
	<div>{element.dataset}</div>
}
