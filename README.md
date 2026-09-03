# STUDIO

> Working title only. The entrant will choose the final product name. When that
> happens, update this heading, the `<title>` in `index.html`, and `name` in
> `package.json` together.

An agent-native origami studio for the WebMCP Challenge. A person and an AI agent
share one geometric sheet: both read the same state, use the same constrained
fold engine, and leave every accepted action in one visible history.

## 30-second demo

[Watch the demo on YouTube (30 seconds) →](https://www.youtube.com/watch?v=zX08UfhYe28)

## Why WebMCP

A `<canvas>` exposes no DOM, labelled controls, or layer state. An agent driving
a 3D scene through screenshots and synthetic clicks is guessing, especially
when several paper layers overlap.

Origami instructions have the matching human problem: diagrams make it hard to
identify which flap and crease comes next. WebMCP gives the agent structured
access to the actual legal creases, overlap depth, authored progress, history,
and camera state. Tool calls then perform real validated folds that animate in
the same scene the person controls.

The important proof is recovery. Progress is **measured from the current sheet**,
not remembered from a script. If a person undoes and refolds a step by hand, the
agent can re-read that geometry and continue. If they make a different fold,
`check_progress` reports the divergence and `advance_step` refuses to pretend the
model is still on path.

## Honest scope

This is a **constrained fold system with authored models**, not a general origami
simulator.

It:

- models the sheet as real polygonal facets with explicit layer ordering;
- derives the legal set from a 20-line crease vocabulary and the current sheet;
- supports valley and mountain folds, turn-over, undo, redo, reset, and history
  scrubbing;
- validates every fold and returns a reason when it is rejected;
- animates accepted folds while updating engine state synchronously;
- ships 11 deterministic authored targets across three difficulty tiers;
- keeps completed crease lines dim but pickable, so a person can always take over.

It does **not** support arbitrary drawn creases, general flat-foldability solving,
swept self-collision, layer-accessibility solving, paper thickness or friction,
or reverse/squash/sink/petal folds. That is why it does not claim cranes, dragons,
or other compound animals.

`STACK` means **maximum local paper overlap**, not the number of global painter
ranks. For example, the completed eight-fold packet reports `STACK 4` while the
renderer keeps 17 deterministic ordering ranks. The separate 32-rank ceiling is
a safety policy, not a physics claim.

### Authored catalogue

| Tier | Targets | Steps |
| --- | --- | --- |
| Starter | Triangle, Book fold, Corner tuck | 1 each |
| Easy | Small square, Diagonal packet, Letter fold, Three-corner tuck, Blintz base | 2–4 |
| Medium | Four-fold packet, Nine-panel packet, Eight-fold packet | 4–8 |

The eight-fold packet ends as a centred square with source-frame bounds
`[-0.25, 0.25]²`. The camera preserves that visible compaction instead of zooming
the smaller target back to full size.

## Demo path

1. Open a fresh sheet and select **Blintz base**.
2. Ask, “What state is the sheet in?” → `get_sheet` / `describe_sheet`.
3. Ask, “Show me the next crease.” → `get_next_step` / `highlight_crease`.
4. Ask, “Fold it.” → `advance_step`; the sheet animates and the console records
   the agent action.
5. Undo that step, then apply the same crease by hand. Ask the agent to continue;
   it re-measures the sheet and resumes from the actual state.
6. Fold a different crease instead. `check_progress` reports off-path state and
   `advance_step` refuses rather than fabricating success.

## Run locally

Requires Node.js `^20.19.0` or `>=22.12.0`.

```sh
npm install
npm run dev
```

There is no backend, account, authentication, environment variable, or runtime
network dependency. The sheet lives entirely in the browser.

### Hand controls

- drag to orbit; scroll to zoom;
- hover/focus a crease to preview its connected flap;
- click for valley fold; shift+click for mountain fold;
- use the keyboard-accessible **FOLD CONTROL** list for every legal crease;
- `＋` next authored step, `↶` undo, `↷` redo, `✧` turn over, `↻` reset;
- scrub **ACTION HISTORY** to revisit exact snapshots.

Without a model context the studio remains playable and reports `HAND MODE`,
`OFFLINE`, and `TOOLS 0`. `LIVE` appears only when all 20 tools actually register.

## Test WebMCP

Registration is in [`src/webmcp/runtime.ts`](src/webmcp/runtime.ts); names,
descriptions, schemas, and annotations live in
[`src/webmcp/contracts/`](src/webmcp/contracts/).

Open the app in ChatGPT's in-app browser or Chrome with WebMCP enabled. Confirm
the console shows `LIVE` and `TOOLS 20`, then inspect the tools from DevTools:

```js
const ctx = document.modelContext ?? navigator.modelContext;
(await ctx.getTools()).map((tool) => tool.name);

const tool = (await ctx.getTools()).find((item) => item.name === "list_creases");
await ctx.executeTool(tool, "{}");
```

Read tools cover the sheet, legal creases, models, progress, history, view, and
activity. Write tools fold, advance, undo/redo, reset, flip, select a model,
highlight a crease, and set the shared view. Every handler validates its own
arguments, and rejected geometry is never reported as applied.

## Architecture

```text
src/engine/     pure deterministic geometry and rules; no Three.js or browser APIs
src/scene/      Three.js rendering, animation, picking, highlighting, and framing
src/webmcp/     tool contracts, handlers, registration, and reply formatting
src/ui/         accessible panels and controls
src/store.ts    shared state and intents used by both people and agents
```

Animation is presentation only. The engine updates immediately, and rapid folds
queue visually rather than interleave. `describeSheet` supplies both WebMCP and
the canvas text alternative, so they report the same state.

## Verification

```sh
npm run verify      # 64 engine, scene, store, UI, and WebMCP check groups
npm run typecheck   # strict TypeScript
npm run build       # typecheck plus production build
```

The verifier replays all 11 authored paths, checks deterministic target hashes,
area and material-space conservation, local overlap, layer/facet caps, preview
accuracy, animation queues, framing, crease pickability, tool budgets, handler
validation, registration states, accessibility wiring, and deployable licenses.

Live agent invocation still needs a manual pass in ChatGPT's in-app browser or
Chrome with WebMCP enabled. Automated checks cover registration and the honest
offline fallback, but do not claim that end-to-end browser test has happened.

## Accessibility and licenses

Every fold is keyboard reachable. Glyph buttons have accessible labels, the
canvas description updates with sheet state, results use a polite live region,
and reduced-motion mode removes fold and console motion.

The project is MIT licensed. Three.js retains its MIT notice; self-hosted Archivo
Black and Space Mono retain their SIL Open Font License 1.1 notices. Repository
copies are in [`THIRD_PARTY_LICENSES/`](THIRD_PARTY_LICENSES/) and deployable
copies are emitted under `dist/licenses/`. No CDN assets, textures, HDRIs, audio,
or copyrighted music are included.
