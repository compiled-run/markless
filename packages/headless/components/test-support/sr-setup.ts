// A scenario handler imports the @markless/ui barrel; cold in the dev server that is a multi-second
// waterfall a build never pays, and it would land inside the first gesture's poll.
await import('../src/index.ts');
export {};
