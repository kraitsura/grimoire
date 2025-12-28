# Testing & Benchmarking

Test prompts against LLM providers directly from the CLI.

---

## Providers

Supported providers:
- OpenAI
- Anthropic
- Google Gemini
- Ollama (local)

Configure providers before testing:

```bash
grimoire config llm add openai
grimoire config llm add anthropic
grimoire config llm test openai
```

---

## Commands

### Test Prompts

```bash
grimoire test <name>                    # Default provider
grimoire test <name> -m gpt-4           # Specify model
grimoire test <name> -p anthropic       # Specify provider
grimoire test <name> --temperature 0.5  # Temperature (0-2)
grimoire test <name> --max-tokens 2048  # Max output tokens
grimoire test <name> --vars '{"x":"y"}' # Variables as JSON
grimoire test <name> --no-stream        # Disable streaming
grimoire test <name> --save             # Save to history
grimoire test <name> -i                 # Interactive mode
```

### Cost Estimation

Estimate token costs before running:

```bash
grimoire cost <name>
```

### Benchmarking

Run automated test suites:

```bash
grimoire benchmark <file>
```

### A/B Testing

Compare prompt variations:

```bash
grimoire compare <prompt-a> <prompt-b>
```

---

## Configuration

### Add Providers

```bash
grimoire config llm add openai      # Prompts for API key
grimoire config llm add anthropic
grimoire config llm add google
grimoire config llm add ollama
```

### Test Connection

```bash
grimoire config llm test <provider>
```

### List Providers

```bash
grimoire config llm list
```

### Remove Provider

```bash
grimoire config llm remove <provider>
```

---

## Storage

API keys are stored in `~/.grimoire/.env` with 0600 permissions (owner read/write only).
