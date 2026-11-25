# Story JSON Schema Reference

Location: `web/public/stories/<story-id>/story.json`

## Top-Level Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Kebab-case folder ID (e.g., `konbini-onigiri`). |
| `series` | `string` | Series label shown in the top-left header. |
| `titleJa` | `string` | Japanese title (e.g., `夜のコンビニ`). |
| `titleVi` | `string` | Vietnamese subtitle. |
| `level` | `string` | Target level badge (e.g., `JLPT N5–N4`). |
| `author` | `string` | Credit line shown on the intro screen. |
| `palette` | `string` | Palette key from `mcp-server/palettes.py`. |
| `voices` | `object` | Map of voice keys (`narrator`, `minh`, `clerk`) to `{ label, speakerId, speedScale }`. |
| `characterCard` | `object` | `{ nameJa, subtitle, facts: [{ label, value }] }`. |
| `scenes` | `array` | Ordered array of `StoryScene` objects. |
| `reading` | `object` | `{ sectionTitle, subtitle, sentences, vocab }` for the study screen. |

## DialogueLine Format

```json
{
  "id": "s05_l01",
  "voice": "clerk",
  "speakerLabel": "店員",
  "jaPlain": "おにぎり、温めますか？",
  "ttsText": "おにぎり、あたためますか？",
  "jaRuby": [
    { "t": "おにぎり、" },
    { "t": "温", "r": "あたた" },
    { "t": "めますか？" }
  ],
  "vi": "Cơm nắm này, bạn có muốn hâm nóng không ạ?"
}
```

> `audioUrl` and `durationSec` are automatically populated by `voicevox_generate_story_audio`.
