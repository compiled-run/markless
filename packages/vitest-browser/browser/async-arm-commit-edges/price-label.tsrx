export default function PriceLabel({ amount, unit }: { amount: number; unit: string }) @{
	<b data-label title={unit}>{amount + ' ' + unit}</b>
}
