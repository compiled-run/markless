export default function LedgerLine({ amount }: { readonly amount: string }) @{
	<li data-line>{amount}</li>;
}
