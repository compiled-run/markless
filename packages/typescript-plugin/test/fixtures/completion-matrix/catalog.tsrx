export function CatalogStatementBase() @{
	@/*M4C_STATEMENT_BASE*/
}

export function CatalogStatementAfterIf({ value }: { value: string }) @{
	@if (value) { <span>{value}</span> } @/*M4C_STATEMENT_AFTER_IF*/
}

export function CatalogStatementAfterFor({ values }: { values: string[] }) @{
	@for (const value of values) { <span>{value}</span> } @/*M4C_STATEMENT_AFTER_FOR*/
}

export function CatalogAfterTry({ value }: { value: string }) @{
	@try { <span>{value}</span> } @/*M4C_AFTER_TRY*/
}

export function CatalogSwitchRegion({ value }: { value: string }) @{
	@switch (value) { @case 'x': { <span>x</span> } @/*M4C_SWITCH_REGION*/ }
}

export function CatalogChildrenBase() @{
	<div><span />@/*M4C_CHILDREN_BASE*/<b /></div>
}

export function CatalogChildrenAfterIf({ value }: { value: string }) @{
	<div>@if (value) { <span>{value}</span> } @/*M4C_CHILDREN_AFTER_IF*/<b /></div>
}

export function CatalogChildrenAfterFor({ values }: { values: string[] }) @{
	<div>@for (const value of values) { <span>{value}</span> } @/*M4C_CHILDREN_AFTER_FOR*/<b /></div>
}

@/*M4C_MODULE*/
