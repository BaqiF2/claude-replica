# SkillManager -> SDK Agent Skills Migration

## Summary

This release migrates skill handling to the official Claude Agent SDK Agent Skills API. The custom SkillManager implementation and skill prompt injection are removed.

## Breaking Changes

- `SkillManager`, `Skill`, and related exports are removed from the public API.
- `SessionContext.loadedSkills` is removed.
- `MessageRouter.buildAppendPrompt()` now always returns `undefined`.

## New Behavior

- Skills are auto-discovered by the Claude Agent SDK.
- Project-level discovery only: `.claude/skills/<skill-name>/SKILL.md`.
- Skill tool is enabled by default unless explicitly disallowed.

## Migration Steps

1. Remove any `SkillManager` usage from application code.
2. Move skill files to `.claude/skills/<skill-name>/SKILL.md`.
3. Ensure frontmatter includes `description`.
4. Update tests and any code that referenced `SessionContext.loadedSkills`.
5. Verify that `settingSources` remains `['project']`.

## SKILL.md Example

```markdown
---
name: agent-sdk-dev
description: SDK development guide
---

Skill content...
```

## Validation Checklist

- `npm run build`
- `npm test`
- Start the CLI and confirm SDK discovers project skills.
- Ask: "What skills are available?" and confirm expected list.
- Trigger a known skill and confirm response quality.
