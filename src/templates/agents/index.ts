/**
 * Agent Templates
 *
 * Pre-built agent definitions for common CLI tools.
 */

import { Effect } from "effect";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AgentDefinition } from "../../models/agent";
import * as yaml from "js-yaml";

// Template metadata
export interface AgentTemplate {
  name: string;
  description: string;
  cli: string;
  tags: string[];
}

// Available templates (registered at build time)
const TEMPLATE_NAMES = ["beads", "gh", "git", "npm", "docker"] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/**
 * Get the templates directory path
 */
const getTemplatesDir = (): string => {
  // Use import.meta.url for ESM compatibility
  const currentFile = fileURLToPath(import.meta.url);
  return dirname(currentFile);
};

/**
 * Parse a template file into an AgentDefinition
 */
const parseTemplate = (content: string, name: string): AgentDefinition => {
  if (!content.startsWith("---")) {
    throw new Error("Template must have YAML frontmatter");
  }

  const endMarker = content.indexOf("---", 3);
  if (endMarker === -1) {
    throw new Error("Invalid frontmatter - missing closing ---");
  }

  const frontmatterStr = content.slice(3, endMarker).trim();
  const body = content.slice(endMarker + 3).trim();

  const frontmatter = yaml.load(frontmatterStr) as Record<string, unknown>;

  return {
    name: (frontmatter.name as string) || name,
    description: (frontmatter.description as string) || "",
    tools: frontmatter.tools as string[] | undefined,
    model: frontmatter.model as string | undefined,
    content: body,
    wraps_cli: frontmatter.wraps_cli as string | undefined,
    tags: frontmatter.tags as string[] | undefined,
  };
};

/**
 * List all available template names
 */
export const listTemplateNames = (): TemplateName[] => {
  return [...TEMPLATE_NAMES];
};

/**
 * Get a template by name
 */
export const getTemplate = (
  name: TemplateName
): Effect.Effect<AgentDefinition, Error> =>
  Effect.gen(function* () {
    const templatesDir = getTemplatesDir();
    const templatePath = join(templatesDir, `${name}-agent.md`);

    const file = Bun.file(templatePath);
    const exists = yield* Effect.promise(() => file.exists());

    if (!exists) {
      return yield* Effect.fail(new Error(`Template not found: ${name}`));
    }

    const content = yield* Effect.promise(() => file.text());
    return parseTemplate(content, name);
  });

/**
 * Check if a template exists
 */
export const hasTemplate = (name: string): name is TemplateName => {
  return TEMPLATE_NAMES.includes(name as TemplateName);
};

/**
 * Get metadata for all templates
 */
export const listTemplates = (): Effect.Effect<AgentTemplate[], Error> =>
  Effect.gen(function* () {
    const templates: AgentTemplate[] = [];

    for (const name of TEMPLATE_NAMES) {
      const definition = yield* getTemplate(name).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      );

      if (definition) {
        templates.push({
          name: definition.name,
          description: definition.description,
          cli: definition.wraps_cli ?? "",
          tags: definition.tags ? [...definition.tags] : [],
        });
      }
    }

    return templates;
  });
