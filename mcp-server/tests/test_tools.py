"""Comprehensive test suite for Mini-PixelLab, JLPT image cleaning, VOICEVOX, and Content QA Validator."""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from content_validator import validate_catalog, validate_story_folder
from palettes import get_palette_rgb
from pixel_processor import (
    clean_exam_image,
    process_pixel_background,
    process_pixel_sprite,
    process_sprite_sheet,
)
from voicevox_client import check_voicevox_health, synthesize_line


def _create_mock_ai_character(width: int = 256, height: int = 256, bg=(0, 255, 0)) -> Image.Image:
    """Create a noisy high-res character on a solid backdrop with soft edges."""
    img = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(img)
    draw.ellipse((88, 30, 168, 110), fill=(245, 200, 165), outline=(45, 25, 20), width=6)
    draw.rectangle((108, 60, 120, 74), fill=(255, 255, 255))
    draw.rectangle((136, 60, 148, 74), fill=(255, 255, 255))
    draw.rectangle((92, 112, 164, 198), fill=(52, 84, 142), outline=(25, 25, 40), width=5)
    draw.rectangle((98, 198, 124, 240), fill=(40, 42, 60))
    draw.rectangle((132, 198, 158, 240), fill=(40, 42, 60))
    return img


def test_clean_single_sprite(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_char.png"
    out_path = tmp_path / "clean_char.png"
    _create_mock_ai_character().save(raw_path)

    res = process_pixel_sprite(
        raw_path,
        out_path,
        target_width=32,
        target_height=40,
        palette_name="midnight_tokyo",
        bg_mode="chroma_green",
    )

    assert res["ok"] is True
    assert out_path.exists()
    out = Image.open(out_path).convert("RGBA")
    assert out.size == (32, 40)

    arr = np.array(out)
    assert arr[0, 0, 3] == 0
    assert arr[0, -1, 3] == 0
    visible_pixels = arr[arr[:, :, 3] == 255][:, :3]
    assert len(visible_pixels) > 80

    allowed = set(get_palette_rgb("midnight_tokyo"))
    for px in visible_pixels:
        assert tuple(int(c) for c in px) in allowed


def test_slice_spritesheet(tmp_path: Path) -> None:
    sheet = Image.new("RGB", (512, 128), (255, 255, 255))
    for i in range(4):
        frame = _create_mock_ai_character(128, 128, bg=(255, 255, 255))
        sheet.paste(frame, (i * 128, 0))

    raw_sheet = tmp_path / "raw_walk.png"
    sheet.save(raw_sheet)

    out_dir = tmp_path / "walk_out"
    res = process_sprite_sheet(
        raw_sheet,
        out_dir,
        cols=4,
        rows=1,
        frame_width=32,
        frame_height=32,
        palette_name="konbini_warm",
        bg_mode="white",
    )

    assert res["ok"] is True
    assert res["frame_count"] == 4
    strip = Image.open(out_dir / "spritesheet.png")
    assert strip.size == (128, 32)
    meta = json.loads((out_dir / "meta.json").read_text(encoding="utf-8"))
    assert meta["frameCount"] == 4
    assert meta["frameWidth"] == 32


def test_clean_background_palette_lock(tmp_path: Path) -> None:
    raw_bg = tmp_path / "raw_bg.png"
    out_bg = tmp_path / "clean_bg.png"
    Image.new("RGB", (640, 400), (200, 120, 60)).save(raw_bg)
    res = process_pixel_background(raw_bg, out_bg, palette_name="ramen_midnight")
    assert res["ok"] is True
    out = Image.open(out_bg)
    assert out.size == (320, 200)
    allowed = set(get_palette_rgb("ramen_midnight"))
    arr = np.array(out)
    for px in np.unique(arr.reshape(-1, 3), axis=0):
        assert tuple(int(c) for c in px) in allowed


def test_jlpt_clean_exam_image_strips_watermark_preserves_ink(tmp_path: Path) -> None:
    raw = Image.new("RGB", (120, 80), (255, 255, 255))
    draw = ImageDraw.Draw(raw)
    # Faint light-green academy watermark
    draw.rectangle((10, 10, 110, 70), fill=(215, 245, 215))
    # Crisp black exam line art on top
    draw.rectangle((40, 25, 80, 55), outline=(15, 15, 15), width=3)

    inp = tmp_path / "exam_wm.png"
    out = tmp_path / "exam_clean.png"
    raw.save(inp)

    res = clean_exam_image(inp, out)
    assert res["ok"] is True
    assert res["watermark_pixels_cleaned"] > 2000

    arr = np.array(Image.open(out).convert("RGB"))
    # Watermark area turned clean white
    assert tuple(int(c) for c in arr[15, 15]) == (255, 255, 255)
    # Black exam line art preserved intact
    assert int(arr[26, 41].mean()) < 40


def test_voicevox_live_if_running(tmp_path: Path) -> None:
    health = asyncio.run(check_voicevox_health())
    if not health.get("ok"):
        return  # Skip gracefully when VOICEVOX is not running (e.g., GitHub Actions CI)

    wav_out = tmp_path / "hello.wav"
    res = asyncio.run(
        synthesize_line("いらっしゃいませ！", speaker_id=13, output_path=wav_out)
    )
    assert res["ok"] is True
    assert wav_out.exists()
    assert res["duration_sec"] > 0.3


def test_validate_entire_real_catalog() -> None:
    """Dynamically validate EVERY lesson registered in web/public/stories/index.json + check no orphans."""
    stories_root = Path(__file__).resolve().parents[2] / "web" / "public" / "stories"
    report = validate_catalog(stories_root)

    assert report["ok"] is True, (
        f"Catalog validation failed! failed={report.get('failed_stories')}, "
        f"orphans={report.get('orphan_folders')}, "
        f"issues={[r['issues'] for r in report['results'] if r['issues']]}"
    )
    assert report["story_count"] >= 12
    assert report["orphan_folders"] == []
    assert report["total_issues"] == 0
    assert report["total_audio_checked"] >= 270
    assert report["total_kanji_blocks_checked"] >= 600


def _setup_mock_catalog(tmp_path: Path, story_id: str, category: str = "jlpt") -> tuple[Path, Path]:
    pub = tmp_path / "public"
    sroot = pub / "stories"
    sdir = sroot / story_id
    sdir.mkdir(parents=True)
    (sroot / "index.json").write_text(
        json.dumps({"stories": [{"id": story_id, "category": category}]}),
        encoding="utf-8",
    )
    return pub, sdir


def test_validator_catches_compact_ruby_errors(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "bad-ruby", category="story")
    dummy_mp3 = sdir / "audio" / "a1.mp3"
    dummy_mp3.parent.mkdir(parents=True)
    dummy_mp3.write_bytes(b"\x00" * 1024)

    (sdir / "story.json").write_text(
        json.dumps(
            {
                "id": "bad-ruby",
                "scenes": [
                    {
                        "id": "sc1",
                        "lines": [
                            {
                                "id": "l1",
                                "jaRuby": "今日は{です|です}",  # Missing Kanji ruby + ruby on Kana!
                                "audioUrl": "/stories/bad-ruby/audio/a1.mp3",
                            }
                        ],
                    }
                ],
                "reading": {"sentences": [], "grammar": [], "quiz": []},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is False
    joined = " | ".join(res["issues"])
    assert "Missing Furigana" in joined
    assert "Ruby on non-Kanji" in joined


def _v2_story(story_id: str, *, strict: bool) -> dict:
    story = {
        "id": story_id,
        "engine": "cinema",
        "characterCard": {
            "nameJa": "ゆい",
            "subtitle": "東京の学生",  # kanji without ruby
            "facts": [{"label": "SECRET", "value": "卵焼き", "locked": True}],
        },
        "scenes": [
            {
                "id": "sc1",
                "titleCard": {"title": "お花見"},
                "labels": [{"text": "桜", "x": 10, "y": 10}],
                "summary": "{今日|きょう}は楽しかった",
                "lines": [],
            }
        ],
        "reading": {"sentences": [], "grammar": [], "quiz": []},
    }
    if strict:
        story["artQuality"] = {"minOutlineCompliance": 0.9}
    return story


def test_validator_checks_player_v2_furigana(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "v2-ruby", category="story")
    (sdir / "story.json").write_text(json.dumps(_v2_story("v2-ruby", strict=True), ensure_ascii=False), encoding="utf-8")
    res = validate_story_folder(sdir, web_public_dir=pub)
    joined = " | ".join(res["issues"])
    assert res["ok"] is False
    for where in ("sc1/titleCard", "sc1/labels[0]", "sc1/summary", "characterCard.subtitle", "characterCard.facts[0]"):
        assert where in joined, where
    assert "characterCard.nameJa" not in joined  # pure kana needs no ruby


def test_validator_card_ruby_is_a_warning_for_legacy_stories(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "legacy-card", category="story")
    story = _v2_story("legacy-card", strict=False)
    story["scenes"][0].update({"titleCard": {"title": "{花見|はなみ}"}, "labels": [], "summary": "{今日|きょう}"})
    (sdir / "story.json").write_text(json.dumps(story, ensure_ascii=False), encoding="utf-8")
    res = validate_story_folder(sdir, web_public_dir=pub)
    assert not any("characterCard" in i for i in res["issues"])
    assert any("characterCard.subtitle" in w for w in res["warnings"])


def test_validator_catches_dokkai_issues(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "bad-dokkai")
    (sdir / "dokkai.json").write_text(
        json.dumps(
            {
                "id": "bad-dokkai",
                "passages": [
                    {
                        "id": "p1",
                        "titleJa": "{案内|あんない}",
                        "sentences": [
                            {
                                "id": "s1",
                                "jaRuby": "明日行きます。",  # Missing Furigana!
                                "audioUrl": "/stories/bad-dokkai/audio/missing.mp3",  # Missing MP3!
                            }
                        ],
                        "questions": [
                            {
                                "id": "q1",
                                "questionJa": "{質問|しつもん}",
                                "options": [{"label": "1", "ja": "はい"}],
                                "correctIndex": 3,  # Out of bounds!
                            }
                        ],
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is False
    joined = " | ".join(res["issues"])
    assert "Missing Furigana" in joined
    assert "Missing/Empty Audio" in joined
    assert "Invalid dokkai correctIndex" in joined


def test_validator_catches_gengo_star_order_mismatch(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "bad-gengo")
    (sdir / "gengo.json").write_text(
        json.dumps(
            {
                "id": "bad-gengo",
                "questions": [
                    {
                        "id": "g14",
                        "kind": "star_order",
                        "promptJa": "{母|はは} [[STAR_SLOTS]]。",
                        "starSlotIndex": 2,
                        "starOrder": [0, 1, 2, 3],
                        "options": [
                            {"label": "1", "ja": "a"},
                            {"label": "2", "ja": "b"},
                            {"label": "3", "ja": "c"},
                            {"label": "4", "ja": "d"},
                        ],
                        "correctIndex": 0,  # Mismatch: starOrder[2] is 2, not 0!
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is False
    assert any("Mismatch starOrder vs correctIndex" in msg for msg in res["issues"])


def test_validator_catches_choukai_issues(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "bad-choukai")
    (sdir / "choukai.json").write_text(
        json.dumps(
            {
                "id": "bad-choukai",
                "questions": [
                    {
                        "id": "m1_1",
                        "promptJa": "{何|なに}をしますか。",
                        "audioUrl": "/stories/bad-choukai/audio/missing.mp3",
                        "imageUrl": "/stories/bad-choukai/images/missing.png",
                        "options": [{"label": "1", "ja": "A"}],
                        "correctIndex": 2,
                        "script": [{"speaker": "男", "ja": "行きます。"}],
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    res = validate_story_folder(sdir, web_public_dir=pub)
    assert res["ok"] is False
    joined = " | ".join(res["issues"])
    assert "Missing/Empty Audio" in joined
    assert "Missing/Empty Image" in joined
    assert "Invalid choukai correctIndex" in joined
    assert "Missing Furigana" in joined


def test_vibe_names_match_the_web_engine() -> None:
    """The validator's vibe-kit name sets must mirror the TypeScript sources."""
    import re

    import content_validator as cv

    web = Path(__file__).resolve().parents[2] / "web" / "src"
    vibe = (web / "engine" / "cinemaVibe.ts").read_text(encoding="utf-8")
    themes = (web / "audio" / "themes.ts").read_text(encoding="utf-8")

    def quoted(block: str) -> set[str]:
        return set(re.findall(r'"([a-z_]+)"', block))

    emotes = quoted(re.search(r"EMOTE_NAMES = \[(.*?)\]", vibe, re.S).group(1))
    cameras = quoted(re.search(r"export type CameraMove = (.*?);", vibe, re.S).group(1))
    lights = set(re.findall(r"^\s{2}([a-z_]+): \{", re.search(r"LIGHTS: Record<string, Grade> = \{(.*?)\n\};", vibe, re.S).group(1), re.M))
    sfx = quoted(re.search(r"SFX_NAMES = \[(.*?)\]", themes, re.S).group(1))
    assert emotes == cv.VIBE_EMOTES
    assert cameras == cv.VIBE_CAMERAS
    assert lights == cv.VIBE_LIGHTS
    assert sfx == cv.VIBE_SFX
    motion = (web / "engine" / "sceneMotion.ts").read_text(encoding="utf-8")
    assert quoted(re.search(r"MOTION_TYPES = \[(.*?)\]", motion, re.S).group(1)) == cv.MOTION_TYPES


def test_validator_flags_unknown_vibe_names_and_telop_furigana(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "vibe-bad", category="story")
    story = {
        "id": "vibe-bad",
        "engine": "cinema",
        "scenes": [
            {
                "id": "sc1",
                "light": "neon",
                "lines": [
                    {"id": "l1", "voice": "narrator", "jaPlain": "あ", "jaRuby": "あ", "vi": "a",
                     "emote": "facepalm", "camera": "dolly", "sfx": "boom", "telop": "約束"},
                ],
            }
        ],
        "reading": {"sentences": [], "vocab": [], "grammar": [], "quiz": []},
    }
    (sdir / "story.json").write_text(json.dumps(story, ensure_ascii=False), encoding="utf-8")
    res = validate_story_folder(sdir, web_public_dir=pub)
    joined = " | ".join(res["issues"])
    for tag in ("[Unknown Emote]", "[Unknown Camera]", "[Unknown SFX]", "[Unknown Light]", "l1/telop"):
        assert tag in joined, tag


def test_validator_checks_motion_layers(tmp_path: Path) -> None:
    pub, sdir = _setup_mock_catalog(tmp_path, "motion-bad", category="story")
    story = {
        "id": "motion-bad",
        "engine": "cinema",
        "assets": {"backgrounds": {}, "portraits": {}, "items": {}},
        "scenes": [{"id": "sc1", "backdrop": "proc:airport_train", "lines": [], "motion": [
            {"type": "teleport"},
            {"type": "scroll", "speed": 10, "rects": [[300, 10, 40, 20]]},
            {"type": "mover", "item": "plane", "path": [[0, 0]], "durationSec": 3},
        ]}],
        "backdropMotion": {"nowhere": [{"type": "glow", "at": [1, 1], "r": 3}]},
        "reading": {"sentences": [], "vocab": [], "grammar": [], "quiz": []},
    }
    (sdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
    res = validate_story_folder(sdir, web_public_dir=pub)
    joined = " | ".join(res["issues"])
    for tag in ("[Unknown Motion]", "[Bad Motion Rect]", "mover item 'plane'", "[Bad Backdrop Motion] 'nowhere'"):
        assert tag in joined, tag
    assert any("[Motion Needs Painting]" in w for w in res["warnings"])


def test_done_lines_are_voiced_and_route_b_is_validated(tmp_path: Path) -> None:
    from tts_spec import iter_story_lines

    story = {"scenes": [{"id": "s", "lines": [], "interaction": {"type": "tap", "doneLines": [{"id": "a"}, {"id": "b"}]}}]}
    assert [i for _, i in iter_story_lines(story)] == ["s01_done1", "s01_done2"]

    import content_validator as cv

    web = Path(__file__).resolve().parents[2] / "web" / "src" / "engine"
    sets = (web / "proc" / "shibuya.ts").read_text(encoding="utf-8")
    assert set(re.findall(r"^  (\w+): draw\w+,$", sets, re.M)) == cv.PROC_SETS

    pub, sdir = _setup_mock_catalog(tmp_path, "route-b", category="story")
    bad = {
        "id": "route-b", "engine": "cinema", "assets": {"backgrounds": {}, "portraits": {}},
        "scenes": [{
            "id": "sc1", "backdrop": "set:tokyo_tower", "lines": [{"id": "l1", "voice": "narrator", "jaPlain": "あ", "jaRuby": "あ", "vi": "a", "emoteWho": "ghost"}],
            "people": {"hachi": {"kind": "dog", "x": 10}, "robo": {"kind": "robot", "x": 20}},
            "cues": [{"line": 3}, {"doneLine": 0}, {"done": True}, {"at": 1, "people": [{"who": "nobody", "walkTo": 5}]}],
        }],
        "reading": {"sentences": [], "vocab": [], "grammar": [], "quiz": []},
    }
    (sdir / "story.json").write_text(json.dumps(bad), encoding="utf-8")
    res = validate_story_folder(sdir, web_public_dir=pub)
    joined = " | ".join(res["issues"])
    for tag in ("[Unknown Set]", "[Unknown Person] sc1/robo", "line 3 does not exist", "doneLine 0 does not exist",
                "'done' needs a scene interaction", "person 'nobody'", "emoteWho 'ghost'"):
        assert tag in joined, tag
