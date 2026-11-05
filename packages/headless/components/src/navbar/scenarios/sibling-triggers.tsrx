import { navbar } from '../../index.ts';

function press(name: string): void {
	document.body.dataset.pressed = (document.body.dataset.pressed ?? '') + name + ';';
}

function FindButton() @{
	<navbar.trigger data-testid="find-trigger" aria-label="Find" onClick={() => press('find')} onFocus={() => press('focus')}>
		Find
	</navbar.trigger>
}

function ModeButton({ to }: { readonly to: 'dark' | 'light' }) @{
	<>
		<navbar.trigger class={'mode mode-' + to} data-testid={to + '-trigger'} onClick={() => press(to)}>
			{to}
		</navbar.trigger>
	</>
}

function Relayed({ onPress }: { readonly onPress?: () => void }) @{
	<navbar.trigger data-testid="relay-trigger" onClick={onPress}>Relay</navbar.trigger>
}

function Modes() @{
	<span>
		<ModeButton to="dark" />
		<ModeButton to="light" />
	</span>
}

export default function SiblingTriggers() @{
	<div>
		<navbar.root aria-label="Main" data-testid="root">
			<div>
				<navbar.itemlink href="/" data-testid="brand-itemlink">Brand</navbar.itemlink>
			</div>
			<div>
				<FindButton />
				<Modes />
				<Relayed onPress={() => press('relay')} />
				<Relayed />
			</div>
		</navbar.root>
	</div>
}
