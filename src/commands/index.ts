/**
 * CLI Command Handlers
 */

// Top-level commands (6 total)
export { plCommand } from "./pl";
export { stCommand } from "./st";
export { worktreeCommand } from "./worktree";
export { configCommand } from "./config";
export { spawnCommand } from "./spawn";
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
