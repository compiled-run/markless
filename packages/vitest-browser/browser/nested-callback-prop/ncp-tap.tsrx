export function Tap({ onTap, label }: { readonly onTap: () => void; readonly label: string }) @{
	<button data-pick={label} type="button" onClick={onTap}>{label}</button>
}
