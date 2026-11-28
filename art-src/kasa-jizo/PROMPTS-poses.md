# 笠地蔵 — Pose spike (Bước 0): ojiisan key poses + state frames

Goal: check that an image model can draw the SAME grandfather in new poses (consistent face, hair,
outfit) before the engine gets `pose` / `shot` support. Three poses, each with a state variant:

| File (save here, in `art-src/kasa-jizo/`) | What | Used for |
| :--- | :--- | :--- |
| `raw_pose_weave.png` | seated (seiza), weaving a half-finished straw hat on his lap | scene `weave_hats` (hold) |
| `raw_pose_weave_b.png` | EDIT of the above: only the hands / straw strands moved | weaving loop, hold progress |
| `raw_pose_place_hat.png` | standing, arms raised, holding a straw hat at head height | scene `five_hats` (drag) |
| `raw_pose_place_hat_b.png` | EDIT: only arms + hat lowered (hat set down) | drag progress |
| `raw_pose_stand.png` | standing upright, hands at his sides | base for the bow |
| `raw_pose_bow.png` | EDIT: polite ojigi bow, same feet and size | `お辞儀` beats |

## How the reference video syncs a hand with a lever (and why we copy it)

The Edison lever scene is NOT two separate objects (arm + lever) kept in sync by code. It is two
complete paintings, "lever down" and "lever up", that differ only in the arm + lever region (~7% of
the pixels; face and body are identical). When the drag reaches the end, the stage swaps the
painting in one frame and hides the pop with a small white flash. So: generate the base pose once,
then make each state as an EDIT of that exact image ("change only the hands"), and let the pipeline
(`frame_regions`, as for talk/blink frames) copy everything outside the changed box from the base
frame, so nothing else can jitter.

## Pass criteria

1. At 320×200 (full body about 110–130 px tall) you recognise the same ojiisan as `raw_sheet_ojiisan_warm.png`.
2. In each `_b` edit, everything outside the hands/arms box is unchanged (`frame_regions` locks it anyway).
3. `pixellab_sprite_quality` on the sliced sheet: outline ≥ 0.94, orphans ≤ 10 %.

Fail → fallback: insert shots of hands + props (no face to keep consistent) and arm-only layers.

## Prompts

Attach as references: `raw_sheet_ojiisan_warm.png` (identity), `raw_walk_ojiisan.png` (outfit, body),
`raw_bg_hut_hearth.png` (style only). Square 1:1 output.

**Shared prefix (every base pose):**
> Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark
> espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel
> shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.
> The SAME elderly Japanese grandfather as in the reference images: white hair tied in a small
> topknot, bushy white eyebrows, kind wrinkled face, brown patched quilted hanten jacket over a dark
> navy kimono, blue-and-white tenugui cloth tied at the neck, dark work trousers, straw sandals.
> Keep his face, hair, outfit colours and proportions identical to the references.
> Single character centred on a FLAT SOLID BRIGHT CHROMA GREEN (#00FF00) background, zero shadows,
> zero floor, zero props except the ones described. Full body visible with empty green margin.
> Reference 1: his expression sheet (identity). Reference 2: his full-body walk sheet (outfit and
> body proportions). Reference 3: a background of this story (match its pixel art style, outline
> colour and shading warmth, but do NOT draw the background).

**`raw_pose_weave.png`** — prefix +
> Pose: he sits on his knees (seiza) on the floor, three-quarter view facing RIGHT, weaving a
> half-finished golden straw sugegasa hat that rests on his lap; both hands hold straw strands, head
> tilted down looking at his work with a gentle focused smile.

**`raw_pose_place_hat.png`** — prefix +
> Pose: he stands, side view facing RIGHT, both arms raised forward at shoulder height holding a
> golden straw sugegasa hat with both hands, as if gently placing it on the head of a small stone
> statue in front of him; kind tender expression.

**`raw_pose_stand.png`** — prefix +
> Pose: he stands upright, side view facing RIGHT, hands relaxed at his sides, calm gentle smile.

**Edits** (attach ONLY the base image you just generated):

- `raw_pose_weave_b.png` ← `raw_pose_weave.png`:
  > Edit this image. Keep EVERYTHING pixel-identical (face, eyes, hair, body, jacket, colours,
  > position, background) EXCEPT his two hands and the straw strands: move his right hand outward,
  > pulling a straw strand tight, the left hand holding the hat brim. Only the hands region may change.
- `raw_pose_place_hat_b.png` ← `raw_pose_place_hat.png`:
  > Edit this image. Keep his head, face, body, legs and colours pixel-identical and in the same
  > position. Change ONLY his arms and the hat: arms lowered and stretched further forward, the hat
  > now held lower at chest height, as if it has just been set down. Background stays flat #00FF00.
- `raw_pose_bow.png` ← `raw_pose_stand.png`:
  > Edit this image. Same character, same outfit, same colours, same feet position and same size.
  > Change his pose to a polite Japanese bow (ojigi): upper body bent forward about 35 degrees from
  > the hips, hands placed on the front of his thighs, eyes looking down. Background stays flat #00FF00.

## Generating with the Gemini API

`gen_poses.py` (next to this file) sends exactly these prompts and references and saves the six
`raw_pose_*.png` files here: `GEMINI_API_KEY=... python3 art-src/kasa-jizo/gen_poses.py`. Image
models need a key from a Google AI Studio project with billing enabled: on the free tier their quota
is 0 (HTTP 429 `RESOURCE_EXHAUSTED`, which is what happened in the cloud session that wrote this).
Without a paid key, paste the prompts into the Gemini app with the three reference images attached.
