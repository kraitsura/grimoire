/**
 * Enhancement Template Domain Types
 *
 * Templates define how prompts should be enhanced by the LLM.
 * Built-in templates provide best-practice enhancement strategies.
 */

import { Schema } from "@effect/schema";

/**
 * Template types for categorization
 */
export const TemplateType = Schema.Literal(
  "general",
  "technical",
  "concise",
  "role",
  "format",
  "custom"
);
export type TemplateType = Schema.Schema.Type<typeof TemplateType>;

/**
 * Schema for enhancement template frontmatter in markdown files
 */
export const EnhancementTemplateFrontmatterSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String.pipe(Schema.minLength(1)),
  type: TemplateType,
  isBuiltIn: Schema.Boolean,
  created: Schema.DateFromString,
  updated: Schema.DateFromString,
});

/**
 * Full enhancement template entity with prompt content
 */
export const EnhancementTemplateSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String.pipe(Schema.minLength(1)),
  type: TemplateType,
  isBuiltIn: Schema.Boolean,
  created: Schema.DateFromString,
  updated: Schema.DateFromString,
  prompt: Schema.String.pipe(Schema.minLength(1)), // The system prompt for enhancement
  filePath: Schema.optional(Schema.String),
});

/**
 * Frontmatter type derived from schema
 */
export type EnhancementTemplateFrontmatter = Schema.Schema.Type<
  typeof EnhancementTemplateFrontmatterSchema
>;

/**
 * Enhancement template type derived from schema
 */
export type EnhancementTemplate = Schema.Schema.Type<
  typeof EnhancementTemplateSchema
>;

/**
 * Input for creating a new enhancement template
 */
export const CreateEnhancementTemplateInputSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String.pipe(Schema.minLength(1)),
  type: Schema.optional(TemplateType),
  prompt: Schema.String.pipe(Schema.minLength(1)),
});

export type CreateEnhancementTemplateInput = Schema.Schema.Type<
  typeof CreateEnhancementTemplateInputSchema
>;

/**
 * Input for updating an enhancement template
 */
export const UpdateEnhancementTemplateInputSchema = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  description: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  type: Schema.optional(TemplateType),
  prompt: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
});

export type UpdateEnhancementTemplateInput = Schema.Schema.Type<
  typeof UpdateEnhancementTemplateInputSchema
>;

/**
 * Built-in template IDs for easy reference
 */
export const BUILTIN_TEMPLATE_IDS = {
  GENERAL: "builtin-general",
  TECHNICAL: "builtin-technical",
  CONCISE: "builtin-concise",
  ROLE: "builtin-role",
  FORMAT: "builtin-format",
} as const;

/**
 * Default template to use when none specified
 */
export const DEFAULT_TEMPLATE_ID = BUILTIN_TEMPLATE_IDS.GENERAL;

/**
 * Built-in enhancement templates
 */
export const BUILTIN_TEMPLATES: EnhancementTemplate[] = [
  {
    id: BUILTIN_TEMPLATE_IDS.GENERAL,
    name: "General Enhancement",
    description: "Improve clarity, structure, and specificity",
    type: "general",
    isBuiltIn: true,
    created: new Date("2025-01-01"),
    updated: new Date("2025-01-01"),
    prompt: `You are an expert prompt engineer. Your task is to enhance the following prompt for clarity, specificity, and effectiveness.

Improvements to make:
- Add clear context and constraints where missing
- Specify desired output format if not already defined
- Include relevant examples if they would help
- Remove ambiguity and vague language
- Ensure instructions are actionable and specific

Original prompt:
---
{prompt}
---

Return ONLY the enhanced prompt with no explanations, preamble, or commentary. The output should be ready to use directly.`,
  },
  {
    id: BUILTIN_TEMPLATE_IDS.TECHNICAL,
    name: "Technical Precision",
    description: "Add technical details and edge case handling",
    type: "technical",
    isBuiltIn: true,
    created: new Date("2025-01-01"),
    updated: new Date("2025-01-01"),
    prompt: `You are an expert prompt engineer specializing in technical prompts. Enhance the following prompt for technical accuracy and robustness.

Improvements to make:
- Add edge case handling instructions
- Specify error handling expectations
- Include technical constraints and requirements
- Add validation criteria where appropriate
- Clarify input/output data types and formats
- Consider security and performance implications

Original prompt:
---
{prompt}
---

Return ONLY the enhanced prompt with no explanations, preamble, or commentary. The output should be ready to use directly.`,
  },
  {
    id: BUILTIN_TEMPLATE_IDS.CONCISE,
    name: "Conciseness",
    description: "Reduce verbosity while preserving meaning",
    type: "concise",
    isBuiltIn: true,
    created: new Date("2025-01-01"),
    updated: new Date("2025-01-01"),
    prompt: `You are an expert prompt engineer focused on conciseness. Reduce the verbosity of the following prompt while preserving all critical requirements and meaning.

Improvements to make:
- Remove redundant phrases and repetition
- Combine related instructions into unified statements
- Use precise, economical language
- Eliminate filler words and unnecessary qualifiers
- Maintain all critical requirements and constraints

Original prompt:
---
{prompt}
---

Return ONLY the enhanced prompt with no explanations, preamble, or commentary. The output should be ready to use directly.`,
  },
  {
    id: BUILTIN_TEMPLATE_IDS.ROLE,
    name: "Role Clarity",
    description: "Strengthen persona and behavioral context",
    type: "role",
    isBuiltIn: true,
    created: new Date("2025-01-01"),
    updated: new Date("2025-01-01"),
    prompt: `You are an expert prompt engineer specializing in persona and role design. Enhance the following prompt to strengthen its persona definition and behavioral context.

Improvements to make:
- Define clear expertise areas and knowledge domains
- Add relevant background context for the role
- Specify communication style and tone
- Include behavioral guidelines and boundaries
- Clarify what the persona should and should not do
- Add personality traits if appropriate for the use case

Original prompt:
---
{prompt}
---

Return ONLY the enhanced prompt with no explanations, preamble, or commentary. The output should be ready to use directly.`,
  },
  {
    id: BUILTIN_TEMPLATE_IDS.FORMAT,
    name: "Output Format",
    description: "Add clear output structure requirements",
    type: "format",
    isBuiltIn: true,
    created: new Date("2025-01-01"),
    updated: new Date("2025-01-01"),
    prompt: `You are an expert prompt engineer focused on output formatting. Enhance the following prompt to include clear, specific output structure requirements.

Improvements to make:
- Specify exact output format (JSON, markdown, plain text, etc.)
- Define required fields, sections, or components
- Add examples of expected output structure
- Include validation criteria for the output
- Specify how to handle edge cases in output
- Add formatting guidelines (indentation, headers, etc.)

Original prompt:
---
{prompt}
---

Return ONLY the enhanced prompt with no explanations, preamble, or commentary. The output should be ready to use directly.`,
  },
];

/**
 * Get a built-in template by ID
 */
export function getBuiltinTemplate(
  id: string
): EnhancementTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get default template
 */
export function getDefaultTemplate(): EnhancementTemplate {
  return BUILTIN_TEMPLATES[0];
}
