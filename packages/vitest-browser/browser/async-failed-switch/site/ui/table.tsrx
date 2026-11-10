import type { Children } from '@markless/core';
import { cn } from './cn.ts';
import { classes } from './variants.ts';

type Props = { class?: string; children?: Children; [attribute: string]: unknown };

export function Table({ class: className, children, ...rest }: Props) @{
	<div data-slot="table-container" class={classes.tableContainer}>
		<table data-slot="table" {...rest} class={cn(classes.table, className)}>{children}</table>
	</div>
}

export function TableHeader({ class: className, children, ...rest }: Props) @{
	<thead data-slot="table-header" {...rest} class={cn(classes.tableHeader, className)}>{children}</thead>
}

export function TableBody({ class: className, children, ...rest }: Props) @{
	<tbody data-slot="table-body" {...rest} class={cn(classes.tableBody, className)}>{children}</tbody>
}

export function TableRow({ class: className, children, ...rest }: Props) @{
	<tr data-slot="table-row" {...rest} class={cn(classes.tableRow, className)}>{children}</tr>
}

export function TableHead({ class: className, children, ...rest }: Props) @{
	<th data-slot="table-head" {...rest} class={cn(classes.tableHead, className)}>{children}</th>
}

export function TableCell({ class: className, children, ...rest }: Props) @{
	<td data-slot="table-cell" {...rest} class={cn(classes.tableCell, className)}>{children}</td>
}
