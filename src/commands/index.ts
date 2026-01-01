/**
 * CLI Command Handlers
 */

// Top-level commands (5 namespaces)
export { plCommand } from "./pl";
export { agCommand } from "./ag";
export { stCommand } from "./st";
export { worktreeCommand } from "./worktree";
export { configCommand } from "./config";
export { completionCommand } from "./completion";

// Completion helpers
export {
  listPromptNamesForCompletion,
  listWorktreeNamesForCompletion,
} from "./completion-helpers";

// Re-export subcommand routers for st.ts
export { skillsCommand } from "./skills";
export { pluginsCommand } from "./plugins";
export { agentsCommand } from "./agents";
export { addCommand } from "./add";
