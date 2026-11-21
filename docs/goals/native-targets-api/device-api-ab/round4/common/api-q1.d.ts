// Module: ./api.ts (already written in this app)
export interface CartLine { id: string; name: string; quantity: number; price: number }
export interface Product { id: string; name: string; price: number }
export interface Order { id: string; placedAt: string; total: number }
export interface Address { id: string; label: string; line1: string; city: string }
export declare function getCart(signal?: AbortSignal): Promise<CartLine[]>;
export declare function getProduct(id: string, signal?: AbortSignal): Promise<Product>;
export declare function getOrders(signal?: AbortSignal): Promise<Order[]>;
export declare function getOrder(id: string, signal?: AbortSignal): Promise<Order>;
export declare function deleteOrder(id: string): Promise<void>;
export declare function getAddresses(signal?: AbortSignal): Promise<Address[]>;
export declare function addAddress(input: { label: string; line1: string; city: string }): Promise<Address>;
