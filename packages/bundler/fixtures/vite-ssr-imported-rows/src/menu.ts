export interface MenuEntry {
	id: string;
	label: string;
	children?: readonly MenuEntry[];
}

export const MENU: readonly MenuEntry[] = [
	{
		id: 'fruit',
		label: 'Fruit',
		children: [
			{ id: 'apple', label: 'Apple' },
			{ id: 'pear', label: 'Pear' },
		],
	},
	{
		id: 'veg',
		label: 'Veg',
		children: [
			{ id: 'kale', label: 'Kale' },
			{ id: 'leek', label: 'Leek' },
		],
	},
];
