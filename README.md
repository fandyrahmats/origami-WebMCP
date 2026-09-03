# STUDIO

> **The product name is a placeholder.** Naming the product is the entrant's
> call, so nothing here invents one. Three places to change, and no others:
> this heading, the `<title>` in `index.html`, and `name` in `package.json`
> (currently `nama`). The marquee on the page deliberately carries a pitch
> rather than a name, so there is nothing else to rename.

An agent-native origami studio built for the WebMCP Challenge. A person opens a
sheet of virtual paper in a 3D scene, and an AI agent can read the sheet's real
geometric state and fold it, step by step, alongside them.

## Why this needs WebMCP

A `<canvas>` exposes no DOM. There is no accessible tree, no labelled control,
and no text to scrape. An agent asked to help inside a 3D scene has nothing to
read and nothing reliable to click: it can only guess from pixels, and it cannot
tell which of several overlapping paper layers it just grabbed.

Origami instructions have the matching problem for people. Diagrams encode
valley and mountain creases as dashed and dotted lines, direction as arrows, and
reorientation as "now turn the model over". Beginners stall not because the fold
is hard but because they cannot tell which flap the diagram means.

Structured tools answer the question a diagram cannot: given *this* sheet, in
*this* state, which flap comes next. The agent reads the real crease set, folds
real geometry, and can highlight a crease in the scene so the person sees what it
means instead of hearing it described.

The strongest part is recovery. Progress is **measured, not remembered**: the
studio replays the authored sequence and compares it against the actual sheet.
When the person undoes a step and folds something of their own, `check_progress`
reports that the sheet left the sequence, and `advance_step` refuses rather than
silently correcting the paper. An agent following a script would break at that
moment. One reading live state does not.

## What the fold system does, and does not do

This is a **constrained fold system with authored models**, not an origami
simulator. Being precise about this matters: flat foldability, layer ordering,
and self-intersection are research problems, not a week's work.

It does:

- model the sheet as flat polygonal facets with an **explicit layer order**;
- keep an immutable material-space polygon beside every world-space fragment, so
  only paper physically connected to a crease can move with that hinge;
- derive a **legal crease set from the current state**, re-measured on every
  query, so spent or unreachable creases disappear;
- validate every request and **refuse illegal folds with a reason**;
- animate every accepted fold with a soft presentation-only curl that starts and
  ends at the exact geometry reported by the engine;
- walk 11 deterministic authored targets across starter, easy, and medium tiers.

It does not:

- accept arbitrary user-drawn crease lines. The reference vocabulary contains 20
  lines: twelve role lines derived from current bounds, four source-frame third
  lines for letter folds, and four fixed source-frame packet lines at
  `x/z = ±0.25`;
- solve flat foldability in general;
- perform reverse, squash, sink, or petal folds. **This is why no crane, dragon,
  or other compound animal is offered**;
- simulate physical thickness, friction, elasticity, or strain. The visible curl
  is presentation only and never changes an engine outcome;
- solve swept self-collision or layer accessibility for deep packets. A legal
  fold here means a connected simple reflection inside the 32 layer-order-rank
  policy cap.

### Authored catalogue

| Tier | Targets | Steps |
| --- | --- | --- |
| Starter | Triangle, Book fold, Corner tuck | 1 each |
| Easy | Small square, Diagonal packet, Letter fold, Three-corner tuck, Blintz base | 2–4 |
| Medium | Four-fold packet, Nine-panel packet, Eight-fold packet | 4–8 |

The packet and tuck names are deliberately geometric. They do not imply reverse
folds, pockets opened by layer extraction, or a general origami solver.

The eight-fold packet makes four corner folds, then uses the fixed packet lines
for its last four steps. It finishes as a centred square with source-frame bounds
`[-0.25, 0.25]²`; deriving those lines again from each shrinking silhouette
would make opposite folds drift instead of meeting symmetrically.

### How it is drawn

The engine and final scene both treat folded paper as a mathematical surface.
Every resting facet is rendered at `y = 0`; explicit `renderOrder` resolves which
face is visible without turning layer indices into physical gaps. This is what
prevents a completed packet from looking like detached floating plates. When an
authored target is complete, its legal crease lines keep the same ids and
raycast targets but dim from `0.22` to `0.06` opacity. The final silhouette reads
clearly without taking manual refolding away.

During a fold, each source triangle is subdivided into a seven-division
triangular grid. A narrow hinge band bends while the rest of the flap follows it, then the band collapses
again at both endpoints. The engine still updates synchronously before the first
frame, and a tool never waits for animation. Reduced-motion mode skips the bend
and snaps to the accepted result.

The permanent material-space polygons solve a separate problem: two regions can
occupy the same projected half-plane without being joined to the active hinge.
Connectivity is traversed in the untouched source square, so an overlapping but
disconnected region stays still instead of tearing away with the flap.

The camera follows the silhouette's actual bounds centre so asymmetric states do
not crop. Its display radius never drops below 65% of the fresh-sheet radius, so
a compact target stays visibly smaller instead of being auto-fitted back to full
size. Portrait views pull farther back to preserve horizontal margin. Zoom
remains a multiplier on top, so `set_view` is stable, and elevation floors at 15
degrees because a grazing view collapses a flat sheet to a sliver.

### How this differs from Origami Simulator

[Origami Simulator](https://github.com/amandaghassaei/OrigamiSimulator) by Amanda
Ghassaei, Erik Demaine, and Neil Gershenfeld is the reference work here, and it is
worth being clear that this project is not a lesser version of it. They solve a
different problem.

Origami Simulator takes a **complete crease pattern** and folds every crease
**simultaneously**, driven by one Fold Percent slider. It triangulates the pattern
into a pin-jointed truss with distance and angular constraints and runs a
compliant dynamic solver in GPU fragment shaders. It is far more capable
geometrically than this engine: curved creases, kirigami cuts, arbitrary patterns,
strain visualisation.

This studio folds **one crease at a time, in sequence**, and that is the point
rather than a shortcoming. The WebMCP argument depends on there being a discrete
state an agent can read and a *next step* it can reason about. A fold-percent
slider is a scalar with a DOM: an agent needs no special affordance to drive one.
A sequence of "which flap do I lift now, given this sheet" is exactly what a canvas
cannot expose and what structured tools can.

Two other differences matter for honesty. Origami Simulator does not solve layer
ordering; this studio records an explicit total ordering so every fold and tool
reply has deterministic state. That still is not a collision solver: the studio
refuses requests outside its crease, topology, and layer rules, but it does not
claim that every accepted deep packet could sweep through physical paper. It also
has no strain view, because these facets are rigid and never stretch; showing one
would be fabricated data.

What was worth borrowing was the *feel* of the Fold Percent slider. The equivalent
for a step-based studio is the **action history scrub**, which is in the interface.

One more piece of precision: the `STACK` counter is the **maximum local paper
overlap**—the most facet regions covering any one point—not physical thickness
and not the number of global painter-order ranks. A completed blintz therefore
reports `STACK 2` while its non-overlapping corner flaps occupy five deterministic
ordering ranks; the eight-fold packet reports `STACK 4` while using 17 ranks.
The engine keeps that separate total ordering for deterministic compositing and
refuses folds beyond 32 layer-order ranks. That internal ceiling is a safety
policy, not a claim of layer-accessibility or collision solving.

## Run locally

Node.js `^20.19.0` or `>=22.12.0`, required by the pinned Vite version. Verified
on Node 24.19.0.

```sh
npm install
npm run dev
```

There is no backend, no account, no authentication, and no environment variable.
The sheet lives in the browser, so there is nothing to authorise and no
credentials to hand a judge.

## Playing by hand

The studio is fully playable without an agent. During registration the badge says
`LINKING`. When no model context is present it settles on `HAND MODE` / `OFFLINE`
and tool count `0`. Partial or failed registration says `DEGRADED` or `ERROR`;
`LIVE` and `WEBMCP READY` appear only when all 20 contracts actually register.
The count is always the number accepted by the current surface.

- drag to orbit, scroll to zoom
- open `MODEL` to choose among grouped starter, easy, and medium glyph chips;
  the closed readout keeps the selected target and measured step count visible
- hover a crease to see what it does before committing. The connected flap is
  ghosted where it is now and, fainter, where it will land; the hint names the
  crease and counts the regions it moves
- click a crease to valley-fold it, shift+click to mountain-fold it
- or use the **FOLD CONTROL** list, which is fully keyboard reachable and offers
  both valley `∨` and mountain `∧` for every legal crease. Hovering or focusing a
  row previews that fold too
- glyph actions: `＋` authored next step, `↶` undo, `↷` redo, `✧` turn over,
  `↻` reset. The hint names the exact next fold, and hovering or focusing `＋`
  previews that flap before it moves
- **scrub the ACTION HISTORY strip** to move backward and forward through sheet
  changes. The ribbon has one cell per fold or whole-model flip, green for the
  agent and pink for you, so it shows who did what at a glance. Because history is stored as
  snapshots rather than replayed, scrubbing lands on exact states however far you
  drag. Folding after scrubbing back truncates the redo tail rather than branching

Colour is consistent and carries meaning: a crease at rest is neutral, **pink is
your own pointer**, and **green is a crease an agent marked**. When an agent calls
`highlight_crease`, you see the same ghost preview it is talking about, so "lift
this flap next" stops being a sentence you have to decode. Your pointer takes
priority while you are using it, then attention hands back to whatever the agent
marked.

## Testing the WebMCP tools

Tool registration lives in **[`src/webmcp/runtime.ts`](src/webmcp/runtime.ts)**,
built from the contracts in [`src/webmcp/contracts/`](src/webmcp/contracts).

Open the app in ChatGPT's in-app browser, or in Chrome with the WebMCP flag
enabled, then confirm the console header shows `LIVE` and `TOOLS 20`. Every tool
call streams into that console as one line, tagged green for the agent and pink
for the person, so you can watch who did what.

A quick manual check from DevTools:

```js
const ctx = document.modelContext ?? navigator.modelContext;
(await ctx.getTools()).map((t) => t.name);

const [tool] = (await ctx.getTools()).filter((t) => t.name === "list_creases");
await ctx.executeTool(tool, "{}");
```

Things worth asking an agent to do:

1. "What state is this sheet in?" → `describe_sheet`
2. "Teach me the blintz base." → `select_model`, then `get_next_step`
3. "Show me which crease is next." → `highlight_crease`, and watch it pulse
4. "Fold it." → `advance_step`
5. Now undo a step yourself and fold a different crease by hand, then ask the
   agent to continue → `check_progress` reports the divergence honestly
6. "Fold along crease `zzz`." → refused, and the refusal names the legal ids

### The 20 tools

Read, all annotated `readOnlyHint`: `get_sheet`, `list_creases`,
`describe_sheet`, `list_models`, `get_active_model`, `get_next_step`,
`check_progress`, `get_fold_history`, `get_view`, `get_tool_activity`.

Write: `fold_crease`, `advance_step`, `undo_fold`, `redo_fold`, `reset_sheet`,
`flip_sheet`, `select_model`, `highlight_crease`, `clear_highlight`, `set_view`.

`get_fold_history` keeps its public tool name but returns action history: folds and
whole-model flips, newest ten plus total/truncation counts. `get_tool_activity`
returns eight bounded caller summaries and carries `untrustedContentHint` because
that text came from callers. `reset_sheet` needs `confirm: true` to discard more
than three folds; that is the only gate in the product, since nothing here spends
money.

## How it is put together

```text
src/engine/     pure geometry and rules. No Three.js, no DOM, no browser APIs.
src/scene/      Three.js rendering of whatever the engine reports.
src/webmcp/     tool contracts and handlers. Calls the store, never the scene.
src/ui/         panels. Read the store, dispatch intents.
src/store.ts    one state object, subscribe and dispatch.
```

The engine is deterministic and synchronous: the same state and the same request
always produce the same result. A fold from a person and a fold from an agent go
through identical code, which is what makes the history's origin tags meaningful
rather than decorative. Animation is presentation only, so a tool result never
waits on a frame, and folds arriving mid-animation queue instead of interleaving.

`describeSheet` feeds both the `describe_sheet` tool and the canvas's accessible
description, so a screen reader user and an agent are told exactly the same thing
about the paper.

## Verification

```sh
npm run verify      # engine, scene, store, and WebMCP checks in Node
npm run typecheck   # tsc --noEmit
npm run build       # typecheck then production build
```

`npm run verify` runs 64 named check groups, with per-model and per-facet
assertions inside them. Every one of the 11 authored paths must make only legal
folds, report exact measured progress at every state, preserve both world area and
the material-space partition at `1.0`, stay below the facet/layer policy caps, and
finish at an approved deterministic target hash. Facet ids must be unique, layers
dense, coordinates finite, and every world vertex must retain its paired source
vertex.

Topology and rendering have direct regressions too. A projected but materially
disconnected island is proved to stay still. Preview source and destination
geometry must equal the applied fold. Resting meshes are inspected to ensure every
facet remains at `y = 0` and layer order is carried only by `renderOrder`. Front
and back normals must agree with `faceUp`; camera framing must centre every
authored state at desktop and phone aspects without hiding compaction; and
completed-model crease lines must dim without losing ids or pickability.
Undo/reset supersedes obsolete animation, while three rapid folds stay FIFO and
restore the current agent preview only after final idle. Orbit dragging must
clear stale person hover before handing attention back. Curl geometry must equal
the source at progress `0`, rise above the hinge mid-fold, and equal the engine
reflection at progress `1`.

The same run checks all 20 tool contracts and handlers, proves every read-only
tool leaves the sheet unchanged, parses every real reply as one JSON envelope,
and keeps each under the roughly 1.5K guidance. Every state along all 11 authored
paths must retain its complete structured `list_creases` result rather than fall
back to a truncation marker. Multiline and oversized caller ids are exercised
through the registered runtime; status and activity remain single-line and
character-bounded, and the relevant contracts carry input caps and
untrusted-content annotations. The suite also exercises working, offline, live,
degraded, and error registration with fake surfaces, plus history/divergence
behaviour, deployable license notices, zero Three.js imports in the engine, and
zero scene imports in WebMCP.

**Not verified here:** the tools have not been exercised in a live WebMCP browser
from this environment, because none is available to it. The registration code
path, the honest-count behaviour, and the offline fallback are covered by the
checks above, but end-to-end agent invocation needs a manual pass in ChatGPT's
in-app browser or Chrome with the flag on.

## Accessibility

- every fold reachable by keyboard through a real control list, not only by
  pointer gestures on the canvas
- the canvas carries a text alternative that updates as the sheet changes
- fold results and refusals announced through a polite live region
- every glyph control has an `aria-label`; the copy rules guarantee there is no
  visible caption to fall back on
- crease type is never conveyed by colour alone: valley and mountain are separate
  labelled controls, and tool output names the type in words
- `prefers-reduced-motion` snaps folds instead of animating and stops the console
  auto-scrolling

Full validation needs manual testing with assistive technology and expert
review. The above is the floor, not a certification.

## Versions

Pinned exactly, no caret ranges, so a clone gets the build that was tested.

- Three.js `0.185.1`, `@types/three` `0.185.4`
- Vite `8.2.2`
- TypeScript `7.0.2`

## Third-party assets

Three.js is MIT licensed and its notice is preserved in distributed builds.
Archivo Black 400 and Space Mono 400/700 are bundled from pinned Fontsource
packages and loaded locally; both fonts use the SIL Open Font License 1.1. Full
notices live in [`THIRD_PARTY_LICENSES/`](THIRD_PARTY_LICENSES/) and deployable
copies are emitted at `dist/licenses/`. There are no CDN requests, textures,
HDRIs, or audio. Everything else visual is geometry and lighting.

## License

MIT. See [LICENSE](LICENSE).
