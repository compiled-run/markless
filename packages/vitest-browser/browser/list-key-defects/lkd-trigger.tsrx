export default function Trigger({ onPress }: { readonly onPress?: () => void }) @{
	<button type="button" data-trigger onClick={() => onPress?.()}>Remove first</button>
}
