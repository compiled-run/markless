// Two projection layers between the consumer that mints the handle and the part
// that reads it: the card sits inside a panel, and the panel inside the root.
export function TourRoot({ children }) @{
	<div data-tg-tour-root>{children}</div>
}

export function TourPanel({ children }) @{
	<div data-tg-tour-panel>{children}</div>
}
