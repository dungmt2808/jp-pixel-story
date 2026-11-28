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

## Result (2026-11-28): PASS, with two notes

Five raws arrived (made in the Gemini app): `raw_pose_weave`, `raw_pose_weave_b`, `raw_pose_place_hat`,
`raw_pose_place_hat_b`, `raw_pose_bow` (no separate `stand`; the bow is used as a single pose).
Processed with the real sheet pipeline (chroma green, `kasa_jizo` palette, `pixel_pitch` 11 = one fixed
scale for every pose, cleanup, sheet colour budget) and composited on the story backgrounds:

| Check | Result |
| :--- | :--- |
| Same grandfather at 320×200 | yes: standing ≈ 104 px, kneeling ≈ 101 px; face, topknot, tenugui, patched hanten all read |
| Edits change only the arms | yes: in the raws the face box changes 0.5 % (weave) / 1.9 % (place_hat); the moved part is 7–10 % of the image, like the reference lever (7 %) |
| Outline | 0.998–1.0 (≥ 0.94) |
| Noise (isolated px) | 11–13 % at 20–24 colours: over the 10 % rule, from the real straw weave / quilting texture |

What the pipeline needs for poses (Bước 3, `kind: "pose"` in art.json):
1. **Splice the edit at RAW level**: edit pixels only where the pose moved (diff > 60, speckle removed,
   grown 31 px), base pixels everywhere else. The model's edit shifts colours by ~4/255 overall, enough to
   flip many jacket pixels to a neighbouring palette entry (visible flicker); spliced, the face and body
   are byte-identical between the two frames.
2. Then lock the auto-detected moved box (`frame_regions`), as for talk/blink frames.
3. One `pixel_pitch` for every pose of a character, and do not put these ~104 px poses in the same shot
   as the old 64 px walk sheet (the scale jump is obvious): regenerate the walk at the same pitch if a
   scene needs both.
4. Noise: give full-body textured poses a reasoned `artExceptions` entry (woven straw, quilted cotton), or
   a per-kind threshold.

---

# Obaasan (おばあさん) — key poses (Bước 3, second character)

Same technique as ojiisan (base painting + "change only the hands" edits). She faces LEFT (she stands on
the right of the shot, facing her husband / the hearth); the sheet is mirrored when a scene needs her
facing right. Reference 2 is one of HIS poses, so she comes out at the same pixel size and shading.

| Save as (in `art-src/kasa-jizo/`) | Pose | Scene and line it acts |
| :--- | :--- | :--- |
| `raw_pose_obaasan_see_off.png` + `_see_off_b` | waving goodbye (2-frame wave) | `pack_departure`: 「…いってらっしゃいませ。」 |
| `raw_pose_obaasan_pour_tea.png` + `_pour_tea_b` | kneeling, pouring tea (level → pouring) | `home_empty`: choice 「熱いお茶を飲みましょう」 |
| `raw_pose_obaasan_peek.png` + `_peek_b` | peeking out of the shoji, listening → surprise | `midnight_song`: 「あっ！雪の向こうに…影が見えますよ！」 |
| `raw_pose_obaasan_thanks.png` | palms together, grateful (gassho) | `new_year_gifts`: 「お地蔵様、本当にありがとうございます！」 |

7 images. Make the 4 bases first (attach the 3 references), then each `_b` as an EDIT of its own base
(attach ONLY that base image). `art.json` already declares the `obaasan_poses` sheet; once the files are
here, `pixellab_apply_art_manifest` builds it (until then it is listed under `waiting_for_art`).

Prompts (generated from `poses_prompts.json`, same text as `gen_poses.py --set obaasan --print`):

```text
=== raw_pose_obaasan_see_off.png  (attach: raw_sheet_obaasan_warm.png, raw_pose_place_hat.png, raw_bg_hut_hearth.png)
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.
The SAME elderly Japanese grandmother as in the reference sheet: silver-white hair combed back into a low round bun at the nape, kind dark eyes, soft rosy cheeks, gentle wrinkles, a terracotta-red quilted winter kimono with a cream inner collar, a long beige-brown work apron tied over it, a dark brown lower kimono, white tabi socks and straw zori sandals. She is about as tall as her husband in reference 2 and drawn at EXACTLY the same pixel size, outline colour and shading as him. Keep her face, hair, outfit colours and proportions identical to reference 1.
Pose: she stands in a doorway pose, side view facing LEFT, her right hand raised high and open, waving goodbye, the other hand resting on her apron; a warm caring smile, eyes open, as if saying 'itterasshaimase' to her husband walking out into the snow.
Single character centred on a FLAT SOLID BRIGHT CHROMA GREEN (#00FF00) background, zero shadows, zero floor, zero props except the ones described. Full body visible with empty green margin.
Reference 1: her expression sheet (identity, outfit colours). Reference 2: a full-body pose of her husband (match its pixel size, chunky pixel clusters, outline colour, shading and body proportions exactly; do NOT draw him). Reference 3: a background of this story (match its warm palette, but do NOT draw the background).

=== raw_pose_obaasan_pour_tea.png  (attach: raw_sheet_obaasan_warm.png, raw_pose_place_hat.png, raw_bg_hut_hearth.png)
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.
The SAME elderly Japanese grandmother as in the reference sheet: silver-white hair combed back into a low round bun at the nape, kind dark eyes, soft rosy cheeks, gentle wrinkles, a terracotta-red quilted winter kimono with a cream inner collar, a long beige-brown work apron tied over it, a dark brown lower kimono, white tabi socks and straw zori sandals. She is about as tall as her husband in reference 2 and drawn at EXACTLY the same pixel size, outline colour and shading as him. Keep her face, hair, outfit colours and proportions identical to reference 1.
Pose: she sits on her knees (seiza) on the floor, three-quarter view facing LEFT, holding a small black iron teapot by its handle in her right hand above a small round teacup that she holds in her left hand in front of her knees; the teapot is level (not pouring yet); a soft welcoming smile.
Single character centred on a FLAT SOLID BRIGHT CHROMA GREEN (#00FF00) background, zero shadows, zero floor, zero props except the ones described. Full body visible with empty green margin.
Reference 1: her expression sheet (identity, outfit colours). Reference 2: a full-body pose of her husband (match its pixel size, chunky pixel clusters, outline colour, shading and body proportions exactly; do NOT draw him). Reference 3: a background of this story (match its warm palette, but do NOT draw the background).

=== raw_pose_obaasan_peek.png  (attach: raw_sheet_obaasan_warm.png, raw_pose_place_hat.png, raw_bg_hut_hearth.png)
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.
The SAME elderly Japanese grandmother as in the reference sheet: silver-white hair combed back into a low round bun at the nape, kind dark eyes, soft rosy cheeks, gentle wrinkles, a terracotta-red quilted winter kimono with a cream inner collar, a long beige-brown work apron tied over it, a dark brown lower kimono, white tabi socks and straw zori sandals. She is about as tall as her husband in reference 2 and drawn at EXACTLY the same pixel size, outline colour and shading as him. Keep her face, hair, outfit colours and proportions identical to reference 1.
Pose: she stands, side view facing LEFT, leaning slightly forward as if peeking out of a paper shoji window, her left hand raised beside her ear to listen, the right hand touching her chin; curious, attentive expression.
Single character centred on a FLAT SOLID BRIGHT CHROMA GREEN (#00FF00) background, zero shadows, zero floor, zero props except the ones described. Full body visible with empty green margin.
Reference 1: her expression sheet (identity, outfit colours). Reference 2: a full-body pose of her husband (match its pixel size, chunky pixel clusters, outline colour, shading and body proportions exactly; do NOT draw him). Reference 3: a background of this story (match its warm palette, but do NOT draw the background).

=== raw_pose_obaasan_thanks.png  (attach: raw_sheet_obaasan_warm.png, raw_pose_place_hat.png, raw_bg_hut_hearth.png)
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.
The SAME elderly Japanese grandmother as in the reference sheet: silver-white hair combed back into a low round bun at the nape, kind dark eyes, soft rosy cheeks, gentle wrinkles, a terracotta-red quilted winter kimono with a cream inner collar, a long beige-brown work apron tied over it, a dark brown lower kimono, white tabi socks and straw zori sandals. She is about as tall as her husband in reference 2 and drawn at EXACTLY the same pixel size, outline colour and shading as him. Keep her face, hair, outfit colours and proportions identical to reference 1.
Pose: she stands, side view facing LEFT, both palms pressed together in front of her chest in a gesture of prayerful thanks (gassho), head bowed slightly, eyes gently closed, a grateful smile.
Single character centred on a FLAT SOLID BRIGHT CHROMA GREEN (#00FF00) background, zero shadows, zero floor, zero props except the ones described. Full body visible with empty green margin.
Reference 1: her expression sheet (identity, outfit colours). Reference 2: a full-body pose of her husband (match its pixel size, chunky pixel clusters, outline colour, shading and body proportions exactly; do NOT draw him). Reference 3: a background of this story (match its warm palette, but do NOT draw the background).

=== raw_pose_obaasan_see_off_b.png  (attach ONLY: raw_pose_obaasan_see_off.png)
Edit this image. Keep EVERYTHING pixel-identical (face, eyes, hair, body, kimono, apron, legs, colours, position, background) EXCEPT her raised right hand and forearm: tilt the waving hand to the other side, as the next frame of a goodbye wave. Only the raised hand and forearm may change.
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.

=== raw_pose_obaasan_pour_tea_b.png  (attach ONLY: raw_pose_obaasan_pour_tea.png)
Edit this image. Keep EVERYTHING pixel-identical (face, eyes, hair, body, kimono, apron, legs, teacup, colours, position, background) EXCEPT the teapot and her right hand: tilt the teapot forward so a thin stream of pale green tea pours from its spout into the cup, with a tiny wisp of steam above the cup. Only the teapot, the hand and the tea stream may change.
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.

=== raw_pose_obaasan_peek_b.png  (attach ONLY: raw_pose_obaasan_peek.png)
Edit this image. Keep her head, face, hair, body, legs and colours pixel-identical and in the same position. Change ONLY her two hands and forearms: both hands now raised in front of her mouth in surprise, fingers spread a little, as if she just saw six snowy figures outside. Background stays flat #00FF00.
Cozy 16-bit Japanese retro adventure game pixel art (GBA / Eastward aesthetic). Warm dark espresso-brown outlines (#241712), never pure black. Crisp chunky pixel clusters, clean 3-tone cel shading, every pixel clearly visible. NO text, NO watermark, NO UI, NO blur.
```

## Obaasan result (2026-11-28): PASS

The 7 images arrived (Gemini app). At pixel_pitch 11 she stands 100–104 px, like ojiisan; every edit
changes only the hand / teapot / hands-at-mouth area (0.8–2.5 % of the image). Sheet `obaasan_poses`
(66×106 frames, facing left, 24 colours; reasoned noise exception for the quilted kimono and woven
apron). Used in kasa-jizo:
- `pack_departure`: either answer cuts to her waving at the entrance (`see_off_loop`, mirrored to face it);
- `home_empty`: 熱いお茶を飲みましょう cuts to her kneeling by the irori, pot level, then pouring (`pour_tea_b`);
- `midnight_song`: during the tap game she listens at the shoji (`peek`); finding the window spot
  (cue anchor `spot`) turns it into the gasp (`peek_b`) as she says 「あっ！…」;
- `new_year_gifts`: a POV of the yard full of gifts; at 「お地蔵様、本当にありがとうございます！」 the couple
  fades in by the porch, she praying (`thanks`), he bowing (`bow`).
`raw_pose_place_hat.png` was replaced by the lossless PNG of the same image (the first copy came through a
webp re-encode; mean difference ~1/255).

