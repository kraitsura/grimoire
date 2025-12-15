# Testing Components

Interactive Ink components for Phase 7 testing features in Grimoire CLI.

## Components

### StreamingOutput

Displays streaming LLM responses with a typing effect and cursor indicator.

**Props:**
- `stream: AsyncIterable<string> | null` - The async iterable stream of text chunks
- `onComplete?: (fullText: string) => void` - Callback when streaming completes
- `showCursor?: boolean` - Show blinking cursor during streaming (default: true)

**Features:**
- Real-time text display as chunks arrive
- Animated cursor indicator during streaming
- Error handling for stream failures
- Cleanup on component unmount

**Example:**
```tsx
import { StreamingOutput } from './testing';

async function* myStream() {
  for (const chunk of chunks) {
    yield chunk;
  }
}

<StreamingOutput
  stream={myStream()}
  onComplete={(text) => console.log(text)}
/>
```

---

### CompareView

Side-by-side comparison of multiple prompt outputs with voting capability.

**Props:**
- `results: CompareResult[]` - Array of results to compare
- `onVote?: (winnerIndex: number) => void` - Callback when user votes
- `onSkip?: () => void` - Callback when user skips voting
- `showVoting?: boolean` - Show voting controls (default: true)

**CompareResult Type:**
```ts
interface CompareResult {
  name: string;
  content: string;
  tokens: number;
  duration: number;
  cost: number;
}
```

**Features:**
- Dynamic column width based on terminal size
- Synchronized layout for all results
- Interactive voting with number keys (1-9)
- Skip option with 's' key
- Green highlight for selected result
- Stats footer with tokens, duration, and cost

**Controls:**
- `1-9` - Vote for corresponding result
- `s` - Skip voting

**Example:**
```tsx
import { CompareView } from './testing';

const results = [
  { name: 'prompt-a', content: '...', tokens: 423, duration: 2.3, cost: 0.0051 },
  { name: 'prompt-b', content: '...', tokens: 398, duration: 2.1, cost: 0.0048 },
];

<CompareView
  results={results}
  onVote={(index) => saveWinner(results[index])}
  onSkip={() => moveToNext()}
/>
```

---

### BenchmarkProgress

Live progress display for running benchmark test suites.

**Props:**
- `title: string` - Benchmark suite title
- `tests: BenchmarkTest[]` - Array of test cases
- `currentTestId?: string` - ID of currently running test
- `currentTestMessage?: string` - Status message for current test

**BenchmarkTest Type:**
```ts
interface BenchmarkTest {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  duration?: number;
  error?: string;
}
```

**Features:**
- Unicode progress bar (40 characters wide)
- Color-coded status icons (✓ ✗ ▶ ○)
- Live percentage and count display
- Current test details box
- Completion summary
- Duration display for completed tests
- Error messages for failed tests

**Status Colors:**
- `passed` - Green ✓
- `failed` - Red ✗
- `running` - Yellow ▶
- `pending` - Gray ○

**Example:**
```tsx
import { BenchmarkProgress } from './testing';

const tests = [
  { id: '1', name: 'Test A', status: 'passed', duration: 1.2 },
  { id: '2', name: 'Test B', status: 'running' },
  { id: '3', name: 'Test C', status: 'pending' },
];

<BenchmarkProgress
  title="Code Generation Benchmark"
  tests={tests}
  currentTestId="2"
  currentTestMessage="Waiting for response..."
/>
```

---

### CostCalculator

Interactive cost estimation tool with live updates.

**Props:**
- `models: ModelPricing[]` - Available models with pricing
- `initialModelIndex?: number` - Starting model index (default: 0)
- `initialInputTokens?: number` - Starting input tokens (default: 1000)
- `initialOutputTokens?: number` - Starting output tokens (default: 500)
- `initialBatchCount?: number` - Starting batch count (default: 1)

**ModelPricing Type:**
```ts
interface ModelPricing {
  name: string;
  inputCostPerMToken: number;  // Cost per 1M input tokens
  outputCostPerMToken: number; // Cost per 1M output tokens
}
```

**Features:**
- Tab navigation between fields
- Arrow key adjustments (↑↓)
- Visual sliders for token counts
- Live cost calculation
- Detailed cost breakdown
- Batch cost multiplication
- Per-request cost display

**Controls:**
- `Tab` - Switch between fields (model → input → output → batch)
- `↑/↓` - Adjust active field value
  - Model: Select different model
  - Input: ±100 tokens per press
  - Output: ±100 tokens per press
  - Batch: ±1 per press

**Example:**
```tsx
import { CostCalculator } from './testing';

const models = [
  { name: 'gpt-4', inputCostPerMToken: 30, outputCostPerMToken: 60 },
  { name: 'gpt-3.5-turbo', inputCostPerMToken: 0.5, outputCostPerMToken: 1.5 },
];

<CostCalculator
  models={models}
  initialInputTokens={1000}
  initialOutputTokens={500}
  initialBatchCount={10}
/>
```

---

## Usage

All components are exported from the index:

```tsx
import {
  StreamingOutput,
  CompareView,
  BenchmarkProgress,
  CostCalculator,
  type StreamingOutputProps,
  type CompareViewProps,
  type CompareResult,
  type BenchmarkProgressProps,
  type BenchmarkTest,
  type CostCalculatorProps,
  type ModelPricing,
} from '@/cli/components/testing';
```

## Examples

See `examples.tsx` for complete working examples of each component.

## Design Patterns

### State Management
- Use `useState` for local component state
- Use `useEffect` for async operations and cleanup
- Use `useInput` for keyboard interaction

### Layout
- All components use Ink's `Box` and `Text` primitives
- Responsive to terminal width (where applicable)
- Consistent spacing with `marginTop`, `marginBottom`, `paddingX`, `paddingY`

### Error Handling
- StreamingOutput catches and displays stream errors
- Components handle missing/empty data gracefully
- No runtime errors for edge cases

### Accessibility
- Clear visual indicators for interactive elements
- Color coding for status (green = success, red = error, yellow = in-progress)
- Keyboard-only navigation (no mouse required)
