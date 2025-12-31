/**
 * Scout Prompt Templates
 *
 * Specialized prompts for scout agents to produce structured findings.
 */

import type { ScoutDepth } from "../../models/scout";

/**
 * Depth-specific instructions
 */
const depthInstructions: Record<ScoutDepth, string> = {
  shallow: `
## Exploration Depth: SHALLOW
- Quick scan only
- Focus on obvious matches
- 2-3 key files maximum
- 1 code example maximum
- Skip deep directory traversal`,

  medium: `
## Exploration Depth: MEDIUM
- Balanced exploration
- Follow relevant imports/references
- 5-10 key files
- 2-3 code examples
- Explore main directories`,

  deep: `
## Exploration Depth: DEEP
- Thorough investigation
- Follow all relevant paths
- Comprehensive file list
- Multiple code examples
- Document edge cases and nuances
- Include implementation details`,
};

/**
 * Generate scout system prompt
 */
export const generateScoutPrompt = (
  question: string,
  options: {
    depth: ScoutDepth;
    focus?: string;
    timeout: number;
  }
): string => {
  const focusSection = options.focus
    ? `
## Focus Area
Concentrate your exploration on: ${options.focus}
Start there and expand outward only if necessary.`
    : "";

  return `You are a Scout agent - a lightweight exploration assistant designed for parallel cognition.

## Your Mission
${question}

## Constraints
- You are READ-ONLY. Do NOT modify any files.
- Do NOT create commits or make changes.
- Focus on understanding and documenting, not changing.
- Be concise but thorough.
- Time limit: ${options.timeout} seconds
${focusSection}
${depthInstructions[options.depth]}

## Output Format
You MUST produce your findings in this EXACT format. This is critical for parsing.

At the END of your exploration, output a findings block like this:

\`\`\`findings
SUMMARY:
[2-3 sentence overview of what you found]

KEY_FILES:
- path/to/file1.ts | Brief description of relevance
- path/to/file2.ts | Brief description of relevance

CODE_PATTERNS:
--- pattern ---
description: What this pattern does
location: path/to/file.ts:42
\`\`\`
example code here
\`\`\`
--- end pattern ---

RELATED_AREAS:
- path/to/related/ | Why this area is related
\`\`\`

## Allowed Tools
You may ONLY use read-only tools:
- Read: Read file contents
- Glob: Find files by pattern
- Grep: Search file contents
- Bash: ONLY for \`ls\`, \`tree\`, \`find\`, \`wc\` (read-only commands)

Do NOT use:
- Write, Edit, or any file modification tools
- Git commit commands
- Any destructive operations

## Process
1. Start by understanding the question
2. Use Glob/Grep to find relevant files
3. Read key files to understand the code
4. Document your findings in the structured format above
5. Output the findings block at the end

Begin exploration now. Remember to output the \`\`\`findings block at the end!`;
};

/**
 * Parse findings from scout output
 */
export const parseFindingsFromOutput = (
  output: string
): {
  summary: string;
  keyFiles: Array<{ path: string; relevance: string }>;
  codePatterns: Array<{ description: string; example: string; location: string }>;
  relatedAreas: Array<{ path: string; description: string }>;
} | null => {
  // Look for the findings block
  const findingsMatch = output.match(/```findings\n([\s\S]*?)```(?:\s*$)?/);
  if (!findingsMatch) {
    // Try to extract what we can from unstructured output
    return extractUnstructuredFindings(output);
  }

  const findingsBlock = findingsMatch[1];

  // Parse SUMMARY
  const summaryMatch = findingsBlock.match(/SUMMARY:\n([\s\S]*?)(?=\n(?:KEY_FILES|CODE_PATTERNS|RELATED_AREAS):|\n*$)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : "No summary provided";

  // Parse KEY_FILES
  const keyFilesMatch = findingsBlock.match(/KEY_FILES:\n([\s\S]*?)(?=\n(?:CODE_PATTERNS|RELATED_AREAS):|\n*$)/);
  const keyFiles: Array<{ path: string; relevance: string }> = [];
  if (keyFilesMatch) {
    const lines = keyFilesMatch[1].trim().split("\n");
    for (const line of lines) {
      const match = line.match(/^-\s*([^\|]+)\s*\|\s*(.+)$/);
      if (match) {
        keyFiles.push({ path: match[1].trim(), relevance: match[2].trim() });
      }
    }
  }

  // Parse CODE_PATTERNS
  const codePatternsMatch = findingsBlock.match(/CODE_PATTERNS:\n([\s\S]*?)(?=\nRELATED_AREAS:|\n*$)/);
  const codePatterns: Array<{ description: string; example: string; location: string }> = [];
  if (codePatternsMatch) {
    const patternBlocks = codePatternsMatch[1].split(/--- pattern ---/).slice(1);
    for (const block of patternBlocks) {
      const descMatch = block.match(/description:\s*(.+)/);
      const locMatch = block.match(/location:\s*(.+)/);
      const exampleMatch = block.match(/```[\w]*\n([\s\S]*?)```/);

      if (descMatch) {
        codePatterns.push({
          description: descMatch[1].trim(),
          location: locMatch ? locMatch[1].trim() : "unknown",
          example: exampleMatch ? exampleMatch[1].trim() : "",
        });
      }
    }
  }

  // Parse RELATED_AREAS
  const relatedAreasMatch = findingsBlock.match(/RELATED_AREAS:\n([\s\S]*?)$/);
  const relatedAreas: Array<{ path: string; description: string }> = [];
  if (relatedAreasMatch) {
    const lines = relatedAreasMatch[1].trim().split("\n");
    for (const line of lines) {
      const match = line.match(/^-\s*([^\|]+)\s*\|\s*(.+)$/);
      if (match) {
        relatedAreas.push({ path: match[1].trim(), description: match[2].trim() });
      }
    }
  }

  return { summary, keyFiles, codePatterns, relatedAreas };
};

/**
 * Extract findings from unstructured output (fallback)
 */
const extractUnstructuredFindings = (
  output: string
): {
  summary: string;
  keyFiles: Array<{ path: string; relevance: string }>;
  codePatterns: Array<{ description: string; example: string; location: string }>;
  relatedAreas: Array<{ path: string; description: string }>;
} => {
  // Try to find file paths mentioned
  const filePathRegex = /(?:^|\s)((?:src|lib|test|app)\/[\w\-\/\.]+\.(?:ts|js|tsx|jsx|py|go|rs))/gm;
  const keyFiles: Array<{ path: string; relevance: string }> = [];
  const seenPaths = new Set<string>();

  let match;
  while ((match = filePathRegex.exec(output)) !== null) {
    const path = match[1];
    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      keyFiles.push({ path, relevance: "mentioned in exploration" });
    }
  }

  // Try to extract a summary from the beginning
  const lines = output.split("\n").filter((l) => l.trim());
  const summary = lines.slice(0, 3).join(" ").slice(0, 500) || "Exploration completed";

  return {
    summary,
    keyFiles: keyFiles.slice(0, 10),
    codePatterns: [],
    relatedAreas: [],
  };
};
