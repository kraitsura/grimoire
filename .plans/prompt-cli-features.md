# Prompt Engineering CLI - Feature List

> A CLI tool for prompt engineers, applied AI practitioners, agentic coders, and daily chatbot users.

**Global Flag:** `-i` — Launch interactive Ink TUI mode for any command

---

## Current Features
- `add` - Create new prompts
- `edit` - Modify existing prompts
- `list` - View all prompts
- `copy` - Copy prompt to clipboard
- `templates` - Manage prompt templates

---

## Planned Features

### Version Control & History
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `history` | View previous versions of a prompt with diffs | High | Medium |
| `rollback` | Revert to a previous version | High | Medium |
| `branch` | Create variations for A/B testing | Medium | High |

### Testing & Evaluation
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `test` | Run a prompt against an LLM and see output | High | Medium |
| `compare` | Run multiple prompt versions side-by-side | High | High |
| `benchmark` | Test against expected inputs/outputs | Medium | High |
| `cost` | Estimate token count and API cost | Medium | Low |

### Organization
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `tag` | Categorize prompts (e.g., "coding", "creative", "production") | High | Low |
| `search` | Full-text search across all prompts | High | Medium |
| `export` | Export prompts to JSON/YAML | Medium | Low |
| `import` | Import prompts from JSON/YAML | Medium | Low |
| `archive` | Hide old prompts without deleting | Low | Low |

### Template Enhancements
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `validate` | Check that all template variables are filled | High | Low |
| `preview` | Render a template with sample values | Medium | Low |
| `vars` | List all variables in a template | Medium | Low |

### Sync & Collaboration
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `sync` | Push/pull from remote (git-style or cloud, user-specified source) | Medium | High |

### Quality of Life
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `format` | Auto-format/lint prompts (consistent XML tags, spacing) | Medium | Medium |
| `stats` | Show character/word/token counts | High | Low |
| `favorite` | Quick access to frequently used prompts | Low | Low |
| `pin` | Pin prompts to top of list | Low | Low |

### Advanced
| Command | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| `chain` | Compose multiple prompts into a workflow | Low | High |
| `alias` | Shortcuts for common commands or prompts | Low | Medium |

---

## Target Users
- **Prompt Engineers** — Version control, testing, benchmarking
- **Applied AI Practitioners** — Templates, chaining, comparison
- **Agentic Coders** — Integration, automation, aliases
- **Daily Chatbot Users** — Easy copy, favorites, search

---

## Implementation Notes

### Interactive Mode (`-i` flag)
Every command can launch an Ink-based TUI for:
- Visual prompt selection
- Side-by-side diff viewing
- Interactive template variable filling
- Real-time test output streaming

### Suggested MVP Order
1. `stats` (low complexity, high value)
2. `tag` + `search` (organization foundation)
3. `history` + `rollback` (version control core)
4. `test` (LLM integration)
5. `validate` + `preview` (template improvements)
