// Module: @markless/device (excerpt)
export declare const platform: 'ios' | 'android' | 'web';
export interface Camera {
	takePhoto(): Promise<Blob>;
}
export declare function camera(): Camera;

// Module: @markless/ui (excerpt): the drawer family
export declare const drawer: {
	root(props: PropsOf<'div'> & { open?: boolean; onChange?: (open: boolean) => void; orientation?: 'horizontal' | 'vertical' }): Element;
	trigger(props: PropsOf<'button'>): Element;
	backdrop(props: PropsOf<'div'>): Element;
	content(props: PropsOf<'div'>): Element;
	title(props: PropsOf<'h2'>): Element;
	close(props: PropsOf<'button'>): Element;
};

// Module: @markless/host
export declare const host: {
	sheet(props: { open?: boolean; onChange?: (open: boolean) => void; sizes?: readonly ('half' | 'full')[]; children?: Children }): Element;
	camera(props: { el: Camera; facing?: 'front' | 'back' }): Element;
	pdf(props: { src: string; page?: number; onPageChange?: (page: number) => void }): Element;
	tabbar(props: { value: string; onChange?: (value: string) => void; children?: Children }): Element;
	tab(props: { value: string; label: string; icon?: string }): Element;
	menu(props: { label: string; children?: Children }): Element;
	item(props: { label: string; onSelect?: () => void }): Element;
};
