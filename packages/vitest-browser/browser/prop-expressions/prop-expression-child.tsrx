export default function Gauge({ mode, level }: { mode?: string; level: number }) @{
	<div data-gauge data-mode={mode ?? 'none'} aria-valuenow={level * 10}>
		{mode === 'v' ? 'V' : 'H'}|{mode}|{(mode ?? '').toUpperCase()}|{level + 1}
	</div>
}

export function Formatted({ formatter, n }: { formatter: { format(value: number): string }; n: number }) @{
	<p data-formatted data-out={formatter.format(n)}>{formatter.format(n + 1)}</p>
}

export function Switch({ tone, pressed }: { tone: string; pressed?: boolean }) @{
	<button data-switch data-tone={tone === 'dark' ? 'dark' : 'light'} aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'}>
		switch
	</button>
}
