/**
 * Templates Command - Manage prompt templates
 */

import { Effect } from "effect";
import { StorageService, EditorService } from "../services";
import type { ParsedArgs } from "../cli/parser";

export const templatesCommand = (args: ParsedArgs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const editor = yield* EditorService;

    // Get subcommand from first positional arg
    const subcommand = args.positional[0];
    const targetArg = args.positional[1];

    if (!subcommand) {
      console.log("Usage: grimoire templates <list|show|vars|create|apply> [args]");
      return;
    }

    switch (subcommand) {
      case "list": {
        // Get all prompts and filter by isTemplate
        const allPrompts = yield* storage.getAll;
        const templates = allPrompts.filter((p) => p.isTemplate);

        if (templates.length === 0) {
          console.log("No templates found.");
          return;
        }

        console.log("NAME".padEnd(25) + "VARIABLES".padEnd(25) + "UPDATED");
        console.log("-".repeat(70));

        for (const t of templates) {
          const vars = extractVariables(t.content);
          const varsStr =
            vars.join(", ").slice(0, 22) +
            (vars.join(", ").length > 22 ? "..." : "");
          const name =
            t.name.slice(0, 22) + (t.name.length > 22 ? "..." : "");
          console.log(
            name.padEnd(25) +
              varsStr.padEnd(25) +
              t.updated.toISOString().split("T")[0]
          );
        }
        break;
      }

      case "show": {
        if (!targetArg) {
          console.log("Usage: grimoire templates show <name-or-id>");
          return;
        }

        const template = yield* storage.getById(targetArg).pipe(
          Effect.catchTag("PromptNotFoundError", () =>
            storage.getByName(targetArg)
          )
        );

        if (!template.isTemplate) {
          console.log("Error: Not a template");
          return;
        }

        // Show with highlighted variables
        console.log(`Template: ${template.name}\n`);
        const highlighted = template.content.replace(
          /\{\{(\w+)(?::([^}]*))?\}\}/g,
          (_, name, def) =>
            `\x1b[33m{{${name}${def ? `:${def}` : ""}}}\x1b[0m`
        );
        console.log(highlighted);
        break;
      }

      case "create": {
        const name = targetArg;
        if (!name) {
          console.log("Usage: grimoire templates create <name>");
          return;
        }

        const content = yield* editor.open(
          "# Your template\n\nHello {{name}}!",
          `${name}.md`
        );

        const template = yield* storage.create({
          name,
          content,
          isTemplate: true,
        });

        console.log(`Created template: ${template.name}`);
        break;
      }

      case "vars": {
        if (!targetArg) {
          console.log("Usage: grimoire templates vars <name-or-id>");
          return;
        }

        const template = yield* storage.getById(targetArg).pipe(
          Effect.catchTag("PromptNotFoundError", () =>
            storage.getByName(targetArg)
          )
        );

        if (!template.isTemplate) {
          console.log("Error: Not a template");
          return;
        }

        const vars = extractVariablesWithDefaults(template.content);

        console.log(`Template: ${template.name}\n`);
        console.log("Variables:");

        const varEntries = Object.entries(vars);
        if (varEntries.length === 0) {
          console.log("  (none)");
        } else {
          console.log("NAME".padEnd(25) + "DEFAULT");
          console.log("-".repeat(50));
          for (const [name, defaultVal] of varEntries) {
            const def = defaultVal || "\x1b[33m(required)\x1b[0m";
            console.log(`${name.padEnd(25)}${def}`);
          }
        }
        break;
      }

      case "apply": {
        if (!targetArg) {
          console.log(
            "Usage: grimoire templates apply <template-name> [--output name] [--var key=value ...]"
          );
          return;
        }

        const template = yield* storage.getById(targetArg).pipe(
          Effect.catchTag("PromptNotFoundError", () =>
            storage.getByName(targetArg)
          )
        );

        const outputName =
          typeof args.flags.output === "string"
            ? args.flags.output
            : `from-${template.name}`;

        // Parse CLI variable overrides from --var flags
        const cliVars: Record<string, string> = {};
        const varFlags = args.flags["var"];
        if (typeof varFlags === "string") {
          const eqIndex = varFlags.indexOf("=");
          if (eqIndex > 0) {
            cliVars[varFlags.slice(0, eqIndex)] = varFlags.slice(eqIndex + 1);
          }
        } else if (Array.isArray(varFlags)) {
          for (const v of varFlags) {
            if (typeof v === "string") {
              const eqIndex = v.indexOf("=");
              if (eqIndex > 0) {
                cliVars[v.slice(0, eqIndex)] = v.slice(eqIndex + 1);
              }
            }
          }
        }

        // Extract variables with defaults
        const vars = extractVariablesWithDefaults(template.content);
        let content = template.content;

        // Apply variables: CLI overrides > defaults
        for (const [varName, defaultVal] of Object.entries(vars)) {
          const value = cliVars[varName] ?? defaultVal;
          if (!value) {
            console.error(`Error: Missing required variable: ${varName}`);
            console.error(`Use --var ${varName}=value to provide it`);
            return;
          }
          content = content.replace(
            new RegExp(`\\{\\{${varName}(?::[^}]*)?\\}\\}`, "g"),
            value
          );
        }

        const prompt = yield* storage.create({
          name: outputName,
          content,
          isTemplate: false,
        });

        console.log(
          `Created prompt: ${prompt.name} from template ${template.name}`
        );
        break;
      }

      default:
        console.log(`Unknown subcommand: ${subcommand}`);
    }
  });

function extractVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{(\w+)(?::[^}]*)?\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

function extractVariablesWithDefaults(
  content: string
): Record<string, string> {
  const result: Record<string, string> = {};
  const matches = content.matchAll(/\{\{(\w+)(?::([^}]*))?\}\}/g);
  for (const match of matches) {
    result[match[1]] = match[2] ?? "";
  }
  return result;
}
