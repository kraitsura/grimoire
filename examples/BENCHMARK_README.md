# Benchmark Command Examples

The `grimoire benchmark` command allows you to run automated test suites against your prompts, validating LLM responses with assertions.

## Basic Usage

```bash
grimoire benchmark examples/benchmark-example.yaml
```

## Test File Structure

Test files are written in YAML format with the following structure:

```yaml
name: Test Suite Name
model: gpt-4o              # Optional - can be overridden with --model flag
prompt: prompt-name-or-id  # Name or ID of prompt from grimoire storage

tests:
  - name: "Test Case Name"
    variables:             # Optional - interpolated into prompt as {{key}}
      language: python
      task: "some task"
    expected:              # Optional - assertions to validate response
      contains: ["text1", "text2"]      # Must contain all strings
      notContains: ["error", "fail"]    # Must not contain any strings
      matches: "\\bregex\\s+pattern"    # Must match regex pattern
```

## Assertions

### Contains
Checks that the response contains all specified substrings:

```yaml
expected:
  contains: ["def ", "print", "return"]
```

### NotContains
Checks that the response does not contain any specified substrings:

```yaml
expected:
  notContains: ["error", "Error", "undefined"]
```

### Matches
Checks that the response matches a regular expression:

```yaml
expected:
  matches: "\\bfunction\\s+\\w+\\s*\\("  # Matches function declarations
```

## Variable Interpolation

Variables are interpolated into the prompt content using `{{variable}}` syntax:

**Prompt content:**
```
Write a {{language}} function to {{task}}.
```

**Test case:**
```yaml
variables:
  language: python
  task: "calculate fibonacci"
```

**Interpolated:**
```
Write a python function to calculate fibonacci.
```

## Command Options

### Model Override
```bash
grimoire benchmark tests/coding.yaml --model gpt-4o-mini
```

### Parallel Execution
Run tests concurrently (default: 3):
```bash
grimoire benchmark tests/coding.yaml --parallel 5
```

### Output Formats

**Table (default):**
```bash
grimoire benchmark tests/coding.yaml

Running: Code Generation Benchmark (5 tests)

✓ Python Hello World (1.2s)
✓ TypeScript Type (1.5s)
✗ Complex Algorithm - missing "yield"
✓ Error Handling (1.8s)
✓ Documentation (1.1s)

────────────────────────────────────────────────────────────
Results: 4/5 passed (80%)
Total time: 6.6s
Total cost: $0.0234
```

**JSON:**
```bash
grimoire benchmark tests/coding.yaml --format json
```

Output:
```json
{
  "suite": "Code Generation Benchmark",
  "results": [
    {
      "name": "Python Hello World",
      "passed": true,
      "duration": 1.2,
      "tokens": {
        "input": 45,
        "output": 123
      },
      "cost": 0.0045
    }
  ],
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "percentage": 80,
    "totalTime": 6.6,
    "totalCost": 0.0234
  }
}
```

**JUnit XML:**
```bash
grimoire benchmark tests/coding.yaml --format junit > results.xml
```

Output:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Code Generation Benchmark" tests="5" failures="1" time="6.600">
  <testcase name="Python Hello World" time="1.200" />
  <testcase name="Complex Algorithm" time="1.300">
    <failure message="missing &quot;yield&quot;" />
  </testcase>
</testsuite>
```

### Verbose Mode
Show full responses in output:
```bash
grimoire benchmark tests/coding.yaml --verbose
```

## Example Test Files

### Code Generation Tests
```yaml
name: Code Generation Tests
model: gpt-4o
prompt: coding-assistant

tests:
  - name: "Python Hello World"
    variables:
      language: python
      task: "print hello world"
    expected:
      contains: ["def ", "print"]
      notContains: ["error"]
      matches: "\\bdef\\s+\\w+"
```

### Translation Tests
```yaml
name: Translation Quality
model: gpt-4o-mini
prompt: translator

tests:
  - name: "English to Spanish"
    variables:
      source_lang: english
      target_lang: spanish
      text: "Hello, how are you?"
    expected:
      contains: ["Hola", "estás"]
      notContains: ["English", "error"]

  - name: "English to French"
    variables:
      source_lang: english
      target_lang: french
      text: "Good morning"
    expected:
      contains: ["Bonjour"]
```

### Sentiment Analysis Tests
```yaml
name: Sentiment Analysis
model: claude-sonnet-4-20250514
prompt: sentiment-analyzer

tests:
  - name: "Positive Sentiment"
    variables:
      text: "I love this product! It's amazing!"
    expected:
      contains: ["positive", "Positive"]
      notContains: ["negative", "neutral"]

  - name: "Negative Sentiment"
    variables:
      text: "This is terrible. I hate it."
    expected:
      contains: ["negative", "Negative"]
      notContains: ["positive"]
```

## CI/CD Integration

The benchmark command works well in CI/CD pipelines:

```bash
# Run tests and fail if any test fails
grimoire benchmark tests/*.yaml --format junit > test-results.xml
if [ $? -ne 0 ]; then
  echo "Tests failed!"
  exit 1
fi
```

## Tips

1. **Start with simple assertions**: Use `contains` first, then add `matches` for stricter validation
2. **Use meaningful test names**: They appear in the output and make debugging easier
3. **Test edge cases**: Include tests for error handling, empty inputs, etc.
4. **Monitor costs**: Use `--verbose` to see which tests are expensive
5. **Optimize concurrency**: Adjust `--parallel` based on your rate limits
6. **Version control test files**: Track your test suites in git alongside prompts
7. **Use different models**: Test with cheaper models first, then validate with expensive ones

## Common Patterns

### Testing Multiple Languages
```yaml
tests:
  - name: "Python Implementation"
    variables: { language: python, task: "fibonacci" }
    expected: { contains: ["def", "return"] }

  - name: "JavaScript Implementation"
    variables: { language: javascript, task: "fibonacci" }
    expected: { contains: ["function", "return"] }

  - name: "TypeScript Implementation"
    variables: { language: typescript, task: "fibonacci" }
    expected: { contains: ["function", "number"] }
```

### Testing Consistency
```yaml
tests:
  - name: "Run 1"
    variables: { task: "describe AI" }
  - name: "Run 2"
    variables: { task: "describe AI" }
  - name: "Run 3"
    variables: { task: "describe AI" }
  # Compare outputs to check consistency
```

### Testing Error Handling
```yaml
tests:
  - name: "Invalid Input"
    variables: { input: "!@#$%^&*" }
    expected:
      contains: ["error", "invalid"]

  - name: "Empty Input"
    variables: { input: "" }
    expected:
      contains: ["required", "missing"]
```
