# Skill Injection Utilities

Utilities for managing skill injections in agent MD files with HTML comment markers.

## Marker Format

```markdown
<!-- skills:managed:start -->
<!-- skill:beads:start -->
## Issue Tracking (beads)
...content...
<!-- skill:beads:end -->
<!-- skills:managed:end -->
```

## API Reference

### `hasManagedSection(content: string): boolean`

Check if a managed section exists in the content.

```typescript
const content = "# My Agent\n\nInstructions here.";
hasManagedSection(content); // false
```

### `addManagedSection(content: string): string`

Add a managed section to the content. If one already exists, returns content unchanged.

```typescript
let content = "# My Agent";
content = addManagedSection(content);
// Now contains: <!-- skills:managed:start -->...<!-- skills:managed:end -->
```

### `hasSkillInjection(content: string, skillName: string): boolean`

Check if a specific skill is injected in the content.

```typescript
hasSkillInjection(content, "beads"); // true/false
```

### `addSkillInjection(content: string, skillName: string, injectionContent: string): Effect<string, InjectionError>`

Add a skill injection to the managed section. Creates the managed section if it doesn't exist.

```typescript
import { Effect } from "effect";

const content = yield* addSkillInjection(
  agentContent,
  "beads",
  "## Issue Tracking\n\nUse beads for tasks."
);
```

**Errors:**
- `InjectionError` - If skill is already injected
- `InjectionError` - If managed section is missing end marker

### `removeSkillInjection(content: string, skillName: string): string`

Remove a skill injection from the managed section. Returns content unchanged if skill is not injected.

```typescript
const updated = removeSkillInjection(content, "beads");
```

### `replaceSkillInjection(content: string, skillName: string, newContent: string): Effect<string, InjectionError>`

Replace an existing skill injection with new content.

```typescript
const content = yield* replaceSkillInjection(
  agentContent,
  "beads",
  "## Updated Beads Instructions"
);
```

**Errors:**
- `InjectionError` - If skill is not injected
- `InjectionError` - If skill has missing end marker
- `InjectionError` - If multiple injections of same skill found

### `listInjectedSkills(content: string): string[]`

List all injected skills in the content. Returns sorted, deduplicated array.

```typescript
const skills = listInjectedSkills(content);
// ["beads", "roo"]
```

## Edge Cases Handled

1. **Missing end markers** - Returns `InjectionError`
2. **Content without managed section** - `addManagedSection` called automatically
3. **Skill already exists** - `addSkillInjection` returns error (use `replaceSkillInjection`)
4. **Multiple same-skill injections** - Returns `InjectionError`
5. **Special characters in skill names** - Properly escaped in regex
6. **Trailing whitespace** - Automatically trimmed from injection content
7. **Empty content** - Handled gracefully

## Usage Example

```typescript
import { Effect } from "effect";
import {
  addManagedSection,
  hasSkillInjection,
  addSkillInjection,
  replaceSkillInjection,
  removeSkillInjection,
  listInjectedSkills,
} from "./injection-utils";

const updateAgentSkills = Effect.gen(function* () {
  let content = "# My Agent\n\nInstructions.";

  // Ensure managed section exists
  content = addManagedSection(content);

  // Add or update skills
  const skills = [
    { name: "beads", content: "## Beads\nTask tracking..." },
    { name: "roo", content: "## Roo\nCode analysis..." },
  ];

  for (const skill of skills) {
    if (hasSkillInjection(content, skill.name)) {
      content = yield* replaceSkillInjection(content, skill.name, skill.content);
    } else {
      content = yield* addSkillInjection(content, skill.name, skill.content);
    }
  }

  // Remove disabled skills
  const currentSkills = listInjectedSkills(content);
  const enabledNames = skills.map((s) => s.name);

  for (const skillName of currentSkills) {
    if (!enabledNames.includes(skillName)) {
      content = removeSkillInjection(content, skillName);
    }
  }

  return content;
});

// Run the effect
const result = await Effect.runPromise(updateAgentSkills);
```

## Implementation Notes

- All functions are pure (except those returning `Effect`)
- Regex patterns properly escape special characters in skill names
- Managed section is always added at the end of the file
- Skills are inserted at the end of the managed section
- Validation ensures markers are properly matched
- Errors are returned through Effect's error channel
