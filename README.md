# &lt;NAMA&gt;

`<NAMA>` is an agent-native origami studio being built for the WebMCP Challenge.

## Day 1 scope

This checkpoint renders one square sheet and supports one animated fold along a single hardcoded diagonal crease. It is intentionally not a general origami simulator, does not accept user-drawn creases, and does not yet derive a general legal crease set.

There is no backend, account, authentication, environment variable, or runtime network dependency.

## Run locally

Node.js `^20.19.0` or `>=22.12.0` is required by the pinned Vite version.

```sh
npm install
npm run dev
```

Click the neon diagonal crease once to fold the paper.

## Verification

```sh
npm run verify:day1
npm run typecheck
npm run build
```

The Day 1 verifier exercises the pure fold engine and the same handler used by the pointer interaction. WebMCP itself is not registered in this checkpoint and cannot be verified in this environment because no browser with the required WebMCP flag is available.

## Versions

- Three.js `0.185.1`
- `@types/three` `0.185.4`
- Vite `8.2.2`
- TypeScript `7.0.2`

All package versions are pinned exactly.

## License

MIT. See [LICENSE](LICENSE).
