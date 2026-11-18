import { request } from './gate.ts';

export type Order = { readonly id: number; readonly item: string };

export function loadOrders(signal: AbortSignal) {
	return request<Order[]>('orders', [{ id: 1, item: 'Tall mug' }], signal);
}
