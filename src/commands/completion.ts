/**
 * Completion Command - Generate shell completion scripts
 */

import { Effect } from "effect";
import type { ParsedArgs } from "../cli/parser";

/**
 * Generate shell completion scripts
 */
export const completionCommand = (args: ParsedArgs): Effect.Effect<void> =>
  Effect.sync(() => {
    const shell = args.positional[0];

    if (!shell) {
      console.log("Usage: grimoire completion <bash|zsh|fish>");
      console.log("\nGenerate shell completion scripts.");
      console.log("\nTo install:");
      console.log('  bash: eval "$(grimoire completion bash)"');
      console.log('  zsh:  eval "$(grimoire completion zsh)"');
      console.log("  fish: grimoire completion fish | source");
      console.log("\nAdd the eval line to your shell's rc file for persistence.");
      return;
    }

    switch (shell) {
      case "bash":
        console.log(generateBashCompletion());
        break;
      case "zsh":
        console.log(generateZshCompletion());
        break;
      case "fish":
        console.log(generateFishCompletion());
        break;
      default:
        console.log(`Unknown shell: ${shell}`);
        console.log("Supported shells: bash, zsh, fish");
    }
  });

/**
 * Generate bash completion script
 */
function generateBashCompletion(): string {
  return `# Grimoire bash completion
_grimoire() {
  local cur prev cmd
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"

  local commands="list add show edit rm copy test cost search reindex stats tag templates export import history versions rollback archive branch alias compare favorite pin format sync completion config"

  case "$prev" in
    grimoire)
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      return 0
      ;;
    templates)
      COMPREPLY=($(compgen -W "list show vars create apply" -- "$cur"))
      return 0
      ;;
    config)
      COMPREPLY=($(compgen -W "llm" -- "$cur"))
      return 0
      ;;
    llm)
      if [[ "$cmd" == "config" ]]; then
        COMPREPLY=($(compgen -W "list add test remove" -- "$cur"))
        return 0
      fi
      ;;
    completion)
      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))
      return 0
      ;;
    archive)
      COMPREPLY=($(compgen -W "list show restore delete" -- "$cur"))
      return 0
      ;;
    branch)
      COMPREPLY=($(compgen -W "list create switch merge delete" -- "$cur"))
      return 0
      ;;
    favorite|pin)
      COMPREPLY=($(compgen -W "list add remove" -- "$cur"))
      return 0
      ;;
  esac

  return 0
}
complete -F _grimoire grimoire
`;
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(): string {
  return `#compdef grimoire
_grimoire() {
  local -a commands
  commands=(
    'list:List all prompts'
    'add:Add a new prompt'
    'show:Show prompt details'
    'edit:Edit a prompt'
    'rm:Delete a prompt'
    'copy:Copy prompt to clipboard'
    'test:Test a prompt with an LLM'
    'cost:Estimate token costs'
    'search:Search prompts'
    'reindex:Rebuild search index'
    'stats:Show statistics'
    'tag:Manage tags'
    'templates:Manage templates'
    'export:Export prompts'
    'import:Import prompts'
    'history:Show edit history'
    'versions:List versions'
    'rollback:Rollback to version'
    'archive:Manage archived prompts'
    'branch:Manage prompt branches'
    'alias:Manage aliases'
    'compare:A/B test prompts'
    'favorite:Manage favorites'
    'pin:Manage pinned prompts'
    'format:Format prompt content'
    'sync:Sync with remote'
    'completion:Generate shell completions'
    'config:Configure settings'
  )

  local -a templates_cmds=(list show vars create apply)
  local -a config_cmds=(llm)
  local -a config_llm_cmds=(list add test remove)
  local -a completion_cmds=(bash zsh fish)
  local -a archive_cmds=(list show restore delete)
  local -a branch_cmds=(list create switch merge delete)
  local -a fav_cmds=(list add remove)

  _arguments -C \\
    '1: :->command' \\
    '*:: :->args'

  case $state in
    command)
      _describe 'commands' commands
      ;;
    args)
      case $words[1] in
        templates) _describe 'subcommands' templates_cmds ;;
        config)
          if (( CURRENT == 2 )); then
            _describe 'subcommands' config_cmds
          elif [[ $words[2] == "llm" ]] && (( CURRENT == 3 )); then
            _describe 'subcommands' config_llm_cmds
          fi
          ;;
        completion) _describe 'shells' completion_cmds ;;
        archive) _describe 'subcommands' archive_cmds ;;
        branch) _describe 'subcommands' branch_cmds ;;
        favorite|pin) _describe 'subcommands' fav_cmds ;;
      esac
      ;;
  esac
}
compdef _grimoire grimoire
`;
}

/**
 * Generate fish completion script
 */
function generateFishCompletion(): string {
  return `# Grimoire fish completion
complete -c grimoire -f

# Main commands
complete -c grimoire -n "__fish_use_subcommand" -a list -d "List all prompts"
complete -c grimoire -n "__fish_use_subcommand" -a add -d "Add a new prompt"
complete -c grimoire -n "__fish_use_subcommand" -a show -d "Show prompt details"
complete -c grimoire -n "__fish_use_subcommand" -a edit -d "Edit a prompt"
complete -c grimoire -n "__fish_use_subcommand" -a rm -d "Delete a prompt"
complete -c grimoire -n "__fish_use_subcommand" -a copy -d "Copy prompt to clipboard"
complete -c grimoire -n "__fish_use_subcommand" -a test -d "Test a prompt with an LLM"
complete -c grimoire -n "__fish_use_subcommand" -a cost -d "Estimate token costs"
complete -c grimoire -n "__fish_use_subcommand" -a search -d "Search prompts"
complete -c grimoire -n "__fish_use_subcommand" -a reindex -d "Rebuild search index"
complete -c grimoire -n "__fish_use_subcommand" -a stats -d "Show statistics"
complete -c grimoire -n "__fish_use_subcommand" -a tag -d "Manage tags"
complete -c grimoire -n "__fish_use_subcommand" -a templates -d "Manage templates"
complete -c grimoire -n "__fish_use_subcommand" -a export -d "Export prompts"
complete -c grimoire -n "__fish_use_subcommand" -a import -d "Import prompts"
complete -c grimoire -n "__fish_use_subcommand" -a history -d "Show edit history"
complete -c grimoire -n "__fish_use_subcommand" -a versions -d "List versions"
complete -c grimoire -n "__fish_use_subcommand" -a rollback -d "Rollback to version"
complete -c grimoire -n "__fish_use_subcommand" -a archive -d "Manage archived prompts"
complete -c grimoire -n "__fish_use_subcommand" -a branch -d "Manage prompt branches"
complete -c grimoire -n "__fish_use_subcommand" -a alias -d "Manage aliases"
complete -c grimoire -n "__fish_use_subcommand" -a compare -d "A/B test prompts"
complete -c grimoire -n "__fish_use_subcommand" -a favorite -d "Manage favorites"
complete -c grimoire -n "__fish_use_subcommand" -a pin -d "Manage pinned prompts"
complete -c grimoire -n "__fish_use_subcommand" -a format -d "Format prompt content"
complete -c grimoire -n "__fish_use_subcommand" -a sync -d "Sync with remote"
complete -c grimoire -n "__fish_use_subcommand" -a completion -d "Generate shell completions"
complete -c grimoire -n "__fish_use_subcommand" -a config -d "Configure settings"

# Subcommands
complete -c grimoire -n "__fish_seen_subcommand_from templates" -a "list show vars create apply"
complete -c grimoire -n "__fish_seen_subcommand_from config" -a "llm"
complete -c grimoire -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
complete -c grimoire -n "__fish_seen_subcommand_from archive" -a "list show restore delete"
complete -c grimoire -n "__fish_seen_subcommand_from branch" -a "list create switch merge delete"
complete -c grimoire -n "__fish_seen_subcommand_from favorite pin" -a "list add remove"
`;
}
