import type { Category, Order, Product } from '../lib/types.ts';

export const categories: Category[] = [
	{ slug: 'home', name: 'Home', blurb: 'Lamps, chairs and soft things' },
	{ slug: 'kitchen', name: 'Kitchen', blurb: 'For slow mornings' },
	{ slug: 'outdoor', name: 'Outdoor', blurb: 'Gear for a night out there' },
	{ slug: 'clearance', name: 'Clearance', blurb: 'Last of the season' },
];

export const products: Product[] = [
	{
		id: 'desk-lamp',
		name: 'Desk lamp',
		price: 4800,
		category: 'home',
		image: '/images/lamp.svg',
		description: 'A warm brass lamp with a weighted base. Tilts to where you read.',
		options: ['Brass', 'Black'],
	},
	{
		id: 'oak-chair',
		name: 'Oak chair',
		price: 12900,
		category: 'home',
		image: '/images/chair.svg',
		description: 'Solid oak, oiled by hand. Stacks two high.',
		options: ['Natural', 'Smoked'],
	},
	{
		id: 'wool-blanket',
		name: 'Wool blanket',
		price: 7600,
		category: 'home',
		image: '/images/blanket.svg',
		description: 'Heavy wool woven in stripes. Warm without being itchy.',
		options: ['Single', 'Double'],
	},
	{
		id: 'stone-mug',
		name: 'Stone mug',
		price: 1800,
		category: 'kitchen',
		image: '/images/mug.svg',
		description: 'A stoneware mug that keeps coffee hot for the whole page.',
		options: ['Small', 'Large'],
	},
	{
		id: 'copper-kettle',
		name: 'Copper kettle',
		price: 6400,
		category: 'kitchen',
		image: '/images/kettle.svg',
		description: 'Whistles when it is ready. Works on every hob.',
		options: ['1 litre', '2 litres'],
	},
	{
		id: 'serving-bowl',
		name: 'Serving bowl',
		price: 3200,
		category: 'kitchen',
		image: '/images/bowl.svg',
		description: 'Deep enough for salad for six.',
		options: ['Teal', 'Sand'],
	},
	{
		id: 'two-person-tent',
		name: 'Two-person tent',
		price: 21900,
		category: 'outdoor',
		image: '/images/tent.svg',
		description: 'Pitches in five minutes, packs to the size of a loaf.',
		options: ['Forest', 'Sand'],
	},
	{
		id: 'camp-lantern',
		name: 'Camp lantern',
		price: 2900,
		category: 'outdoor',
		image: '/images/lantern.svg',
		description: 'Twelve hours of light on one charge.',
		options: ['Warm', 'Daylight'],
	},
];

const orders = new Map<string, Order>();

export function productsIn(category: string | null): Product[] {
	if (category === 'clearance') throw new Error('Clearance is closed while we restock.');
	return category ? products.filter((product) => product.category === category) : products;
}

export function product(id: string): Product | undefined {
	return products.find((entry) => entry.id === id);
}

export function placeOrder(lines: Order['lines']): Order {
	const order = {
		id: String(1000 + orders.size + 1),
		lines,
		total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
	};
	orders.set(order.id, order);
	return order;
}

export function order(id: string): Order | undefined {
	return orders.get(id);
}
