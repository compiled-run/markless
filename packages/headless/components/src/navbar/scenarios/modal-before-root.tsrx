import { state } from '@markless/core';
import { modal, navbar } from '../../index.ts';
import BarTools from './bar-tools.tsrx';

const sections = [{ label: 'Docs' }, { label: 'Learn' }];

export default function ModalBeforeRoot() @{
	<header>
		<MobileMenu />
		<DesktopNav />
	</header>
}

function MobileMenu() @{
	const menu = state({ open: false });
	<div>
		<modal.root data-testid="menu-root" open={menu.open} onChange={(next: boolean) => { menu.open = next; }}>
			<div>
				<BarTools name="mobile" />
				<modal.trigger data-testid="menu-trigger">Menu</modal.trigger>
			</div>
			<modal.backdrop>
				<modal.content aria-label="Menu">
					<modal.close>Close</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</div>
}

function DesktopNav() @{
	<div>
		<navbar.root aria-label="Main" data-testid="root">
			<navbar.itemlink href="/" data-testid="home-itemlink">Home</navbar.itemlink>
			<div>
				@for (const section of sections; key section.label) {
					<Dropdown label={section.label} />
				}
			</div>
			<BarTools name="desktop" />
		</navbar.root>
	</div>
}

function Dropdown({ label }: { readonly label: string }) @{
	<navbar.item value={label} data-testid={label + '-item'}>
		<navbar.itemtrigger data-testid={label + '-itemtrigger'}>{label}</navbar.itemtrigger>
		<navbar.itemcontent data-testid={label + '-itemcontent'}>
			<navbar.itemlink href={'/' + label} data-testid={label + '-itemlink'}>{label}</navbar.itemlink>
		</navbar.itemcontent>
	</navbar.item>
}
