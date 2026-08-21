// The crutch this tool replaces, in the shape the repo actually carried: a hand-written
// sidecar next to the .tsrx, typing the component's props as Record<string, unknown>. Raw
// `tsc` resolves `./counter.tsrx` to this and accepts the wrong argument in consumer.ts.
export declare function Counter(props: Record<string, unknown>): unknown;
