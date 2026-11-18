// Module: ./api.ts (already written in this app)
export interface Order { id: string; placedAt: string; total: number }
export interface Account { name: string; email: string }
export declare function getOrders(signal?: AbortSignal): Promise<Order[]>;
export declare function placeOrder(): Promise<Order>;
// Resolves to a session token.
export declare function signIn(): Promise<string>;
export declare function getAccount(session: string, signal?: AbortSignal): Promise<Account>;
