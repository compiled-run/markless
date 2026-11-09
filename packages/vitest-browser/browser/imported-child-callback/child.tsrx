export function Clicker({ onTick }: { readonly onTick?: () => void }) @{
	<button type="button" data-click onClick={() => onTick?.()}>click</button>
}

export function Ticker({ onTick }: { readonly onTick?: () => void }) @{
	<button
		type="button"
		data-timer
		onClick={() => {
			setTimeout(() => onTick?.(), 10);
		}}
	>
		timer
	</button>
}

// Forwarding the prop inside this module is what used to strand an importer's callback.
function Relay({ onPing }: { readonly onPing?: () => void }) @{
	<div>
		<Clicker onTick={onPing} />
		<Ticker onTick={onPing} />
	</div>
}
