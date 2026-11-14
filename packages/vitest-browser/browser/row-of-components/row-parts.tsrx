export function Amount({ row }: { row: { amount: number } }) @{
	<em>{row.amount}</em>
}

export function Unit({ unit }: { unit: string }) @{
	<small>{unit}</small>
}
