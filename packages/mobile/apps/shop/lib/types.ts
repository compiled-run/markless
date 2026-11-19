export type Category = { readonly slug: string; readonly name: string; readonly blurb: string };

export type Product = {
	readonly id: string;
	readonly name: string;
	readonly price: number;
	readonly category: string;
	readonly image: string;
	readonly description: string;
	readonly options: readonly string[];
};

export type CartLine = {
	readonly key: string;
	readonly id: string;
	readonly name: string;
	readonly price: number;
	readonly option: string;
	readonly quantity: number;
};

export type Order = {
	readonly id: string;
	readonly lines: readonly CartLine[];
	readonly total: number;
};
