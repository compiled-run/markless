export function Picker({ onPick, label }: { readonly onPick: (mark: string) => void; readonly label: string }) @{
	<button data-pick={label} type="button" onClick={() => onPick('!')}>{label}</button>
}

export function Panel({ children }: { readonly children?: unknown }) @{
	<div class="panel">{children}</div>
}
