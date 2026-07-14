export function ChildrenBase() @{
	<div><span />@/*M4B_CHILDREN_BASE*/<b /></div>
}

export function ChildrenAfterIf({ value }: { value: string }) @{
	<div>@if (value) { <span>{value}</span> } @/*M4B_CHILDREN_AFTER_IF*/<b /></div>
}

export function ChildrenAfterFor({ values }: { values: string[] }) @{
	<div>@for (const value of values) { <span>{value}</span> } @/*M4B_CHILDREN_AFTER_FOR*/<b /></div>
}

export function AttributeString() @{
	<div title="prefix @/*M4B_ATTRIBUTE*/ suffix" />
}

export function ExpressionContainer({ value }: { value: number }) @{
	<div>{value + @/*M4B_EXPRESSION_CONTAINER*/}</div>
}

export function OrdinaryString() @{
	const label = "prefix @/*M4B_STRING_LITERAL*/ suffix";
	<span>{label}</span>
}
