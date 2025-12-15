# Test Command Implementation

## Overview

Implemented the `grimoire test` command for testing prompts with LLM providers (OpenAI, Anthropic).

## Files Created/Modified

### Created
- `/Users/aaryareddy/Projects/grimoire/src/commands/test.ts` - Main test command implementation

### Modified
- `/Users/aaryareddy/Projects/grimoire/src/commands/index.ts` - Added testCommand export
- `/Users/aaryareddy/Projects/grimoire/src/index.ts` - Registered test command in CLI router
- `/Users/aaryareddy/Projects/grimoire/src/services/index.ts` - Added LLM service exports and LLMLive layer

## Command Usage

```bash
grimoire test <prompt-name> [OPTIONS]

OPTIONS:
  -m, --model <model>       Model to use (default: gpt-4o)
  -p, --provider <provider> Provider: openai, anthropic, ollama
  --temperature <temp>      Temperature 0-2 (default: 0.7)
  --max-tokens <tokens>     Max output tokens (default: 1024)
  --vars <json>             Variables as JSON: '{"name": "value"}'
  --no-stream               Disable streaming output
  --save                    Save result to prompt history
  -i                        Interactive mode
```

## Examples

```bash
# Test a prompt with default settings (gpt-4o)
grimoire test coding-assistant

# Test with Claude
grimoire test my-prompt --model claude-sonnet-4-20250514

# Test with variables
grimoire test template --vars '{"name": "John", "task": "review code"}'

# Test without streaming
grimoire test my-prompt --no-stream

# Test with custom temperature and max tokens
grimoire test creative-writer --temperature 1.2 --max-tokens 2048
```

## Features Implemented

### Core Functionality
- ✅ Load prompts from storage by name or ID
- ✅ Variable interpolation using `{{variable}}` syntax
- ✅ Streaming output to terminal (real-time display)
- ✅ Non-streaming mode with `--no-stream` flag
- ✅ Support for multiple LLM providers (OpenAI, Anthropic)
- ✅ Model selection via `--model` flag
- ✅ Temperature and max tokens configuration

### Usage Statistics
- ✅ Token counting (input/output)
- ✅ Cost estimation
- ✅ Execution time tracking
- ✅ Formatted stats display

### Output Format
```
Testing: coding-assistant
Model: gpt-4o | Temperature: 0.7

────────────────────────────────────────────────────────────
<streaming response appears here...>
────────────────────────────────────────────────────────────

Tokens: 150 in / 423 out
Cost: $0.0051
Time: 2.3s
```

## Architecture

### Service Dependencies
The test command uses the following services from the Effect ecosystem:

1. **StorageService** - Load prompts from database/filesystem
2. **LLMService** - Abstraction over multiple LLM providers
3. **TokenCounterService** - Accurate token counting with tiktoken

### LLM Service Layer
The LLM services are composed into a `LLMLive` layer that:
- Provides LLMService, ApiKeyService, and TokenCounterService
- Registers OpenAI and Anthropic providers on initialization
- Handles API key management from config/environment

### Error Handling
- Proper Effect error channels for typed errors
- User-friendly error messages for missing API keys
- Graceful handling of missing prompts

## Variable Interpolation

The command supports template variables in prompt content using the `{{variable}}` syntax:

```markdown
---
name: greeting-template
---
Hello {{name}}, welcome to {{location}}!
```

Usage:
```bash
grimoire test greeting-template --vars '{"name": "Alice", "location": "Wonderland"}'
```

## Future Enhancements

### Not Yet Implemented (Marked as TODO)
- ❌ `--save` flag - Save LLM responses to prompt history
- ❌ `-i` / `--interactive` mode - Interactive conversation mode
- ❌ Ollama provider integration
- ❌ Response caching
- ❌ Batch testing multiple prompts
- ❌ Comparison mode (test with multiple models)

## API Key Setup

Before using the test command, you need to configure API keys:

```bash
# Set OpenAI API key
grimoire config set openai YOUR_OPENAI_API_KEY

# Set Anthropic API key
grimoire config set anthropic YOUR_ANTHROPIC_API_KEY

# Or use environment variables
export OPENAI_API_KEY=your-key-here
export ANTHROPIC_API_KEY=your-key-here
```

## Technical Details

### Streaming Implementation
The command uses Effect's Stream API for real-time output:
```typescript
yield* pipe(
  responseStream,
  Stream.runForEach((chunk) =>
    Effect.sync(() => {
      if (!chunk.done && chunk.content) {
        process.stdout.write(chunk.content);
      }
    })
  )
);
```

### Token Counting
- Uses js-tiktoken for accurate token counting matching OpenAI's tokenization
- Supports different encoding schemes per model (o200k_base, cl100k_base)
- Includes message overhead for chat format

### Cost Estimation
Pricing data is maintained in TokenCounterService:
- GPT-4o: $2.50/$10.00 per 1M tokens (input/output)
- GPT-4o-mini: $0.15/$0.60 per 1M tokens
- Claude Sonnet 4: $3.00/$15.00 per 1M tokens

## Testing

To test the command:

1. Create a test prompt:
```bash
grimoire add test-prompt
# Enter content: "Write a haiku about coding"
```

2. Test with OpenAI:
```bash
grimoire test test-prompt --model gpt-4o
```

3. Test with Anthropic:
```bash
grimoire test test-prompt --model claude-sonnet-4-20250514
```

## Dependencies

- **effect** - Effect system for typed functional programming
- **js-tiktoken** - Token counting
- **Bun** - Runtime and fetch API
- Services: LLMService, TokenCounterService, StorageService, ApiKeyService
