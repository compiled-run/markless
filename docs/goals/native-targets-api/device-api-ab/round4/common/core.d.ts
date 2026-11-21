// Module: @markless/core (excerpt: how state crosses screens)
// `state` and `shared` belong to one screen. Only `storage` crosses screens.
// A string kept on the device (on the website, in a cookie). Every screen that reads the same key sees the same value,
// and assigning to it updates every screen at once, including screens kept on the stack:
//   let session = storage('session', ''); … session = token;
export declare function storage(key: string, fallback: string): string;
