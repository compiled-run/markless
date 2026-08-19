type ButtonProps = {
	readonly disabled?: boolean;
	readonly children?: unknown;
};

// QDS also has a toggle mode (pressed + onChange + aria-pressed/ui-pressed). Calling an
// optional callback prop from a handler is MARKLESS_CAPTURE_OPAQUE_PROP today, so it waits.
export default function Button({ disabled, children }: ButtonProps) @{
	<button type="button" disabled={disabled}>{children}</button>
}
