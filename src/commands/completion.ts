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
  local cur prev cmd subcmd
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"
  subcmd="\${COMP_WORDS[2]}"

  # All available commands
  local commands="list add show edit rm copy test cost search reindex stats tag templates export import history versions rollback archive branch alias compare favorite pin format sync completion config skills spawn plugins stash pop tui worktree wt dot enhance agents"

  # Worktree subcommands
  local wt_cmds="ps new spawn kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"

  # Worktree subcommands that need worktree name completion
  local wt_name_cmds="rm remove kill open path exec log logs claim release handoff merge commit pr adopt spawn status"

  case "$prev" in
    grimoire|grim)
      # Complete with commands + dynamic prompt names
      local prompts
      prompts=$(grimoire --cmplt-prompts 2>/dev/null)
      COMPREPLY=($(compgen -W "$commands $prompts" -- "$cur"))
      return 0
      ;;
    wt|worktree)
      COMPREPLY=($(compgen -W "$wt_cmds" -- "$cur"))
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
    skills)
      COMPREPLY=($(compgen -W "init add enable disable list info search sync doctor update validate" -- "$cur"))
      return 0
      ;;
    *)
      # Check if we're completing a worktree subcommand that needs a name
      if [[ "$cmd" == "wt" || "$cmd" == "worktree" ]]; then
        for wt_cmd in $wt_name_cmds; do
          if [[ "$subcmd" == "$wt_cmd" ]]; then
            local worktrees
            worktrees=$(grimoire --cmplt-worktrees 2>/dev/null)
            COMPREPLY=($(compgen -W "$worktrees" -- "$cur"))
            return 0
          fi
        done
      fi
      ;;
  esac

  return 0
}
complete -F _grimoire grimoire grim
`;
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(): string {
  return `#compdef grimoire grim

_grimoire() {
  local -a commands prompts worktrees

  commands=(
    'list:List all prompts'
    'add:Add a new prompt or skill'
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
    'skills:Manage agent skills'
    'spawn:Spawn Claude agent'
    'plugins:Manage Claude plugins'
    'stash:Stash clipboard content'
    'pop:Pop from stash'
    'tui:Launch TUI mode'
    'wt:Git worktree management'
    'worktree:Git worktree management'
    'dot:Browse dotfiles'
    'enhance:AI-powered prompt enhancement'
    'agents:Manage subagents'
  )

  local -a templates_cmds=(list show vars create apply)
  local -a config_cmds=(llm)
  local -a config_llm_cmds=(list add test remove)
  local -a completion_cmds=(bash zsh fish)
  local -a archive_cmds=(list show restore delete)
  local -a branch_cmds=(list create switch merge delete)
  local -a fav_cmds=(list add remove)
  local -a skills_cmds=(init add enable disable list info search sync doctor update validate)
  local -a wt_cmds=(
    'ps:Show worktree status'
    'new:Create new worktree'
    'spawn:Create worktree and spawn agent'
    'kill:Kill agent in worktree'
    'rm:Remove worktree'
    'list:List worktrees'
    'status:Show worktree status'
    'open:Open shell in worktree'
    'path:Get worktree path'
    'exec:Execute command in worktree'
    'log:Show worktree logs'
    'merge:Merge worktree changes'
    'commit:Commit in worktree'
    'pr:Create PR from worktree'
    'adopt:Adopt existing worktree'
    'claim:Claim worktree lock'
    'release:Release worktree lock'
    'handoff:Handoff worktree'
  )
  # Worktree subcommands that need name completion
  local -a wt_name_cmds=(rm remove kill open path exec log logs claim release handoff merge commit pr adopt spawn status)

  _arguments -C \\
    '1: :->command' \\
    '*:: :->args'

  case $state in
    command)
      _describe 'commands' commands
      # Also complete prompt names
      prompts=(\${(f)"\$(grimoire --cmplt-prompts 2>/dev/null)"})
      (( \${#prompts} )) && compadd -a prompts
      ;;
    args)
      case \$words[1] in
        wt|worktree)
          if (( CURRENT == 2 )); then
            _describe 'subcommands' wt_cmds
          elif (( CURRENT == 3 )); then
            # Check if subcommand needs worktree name
            if (( \${wt_name_cmds[(Ie)\$words[2]]} )); then
              worktrees=(\${(f)"\$(grimoire --cmplt-worktrees 2>/dev/null)"})
              (( \${#worktrees} )) && compadd -a worktrees
            fi
          fi
          ;;
        templates) _describe 'subcommands' templates_cmds ;;
        config)
          if (( CURRENT == 2 )); then
            _describe 'subcommands' config_cmds
          elif [[ \$words[2] == "llm" ]] && (( CURRENT == 3 )); then
            _describe 'subcommands' config_llm_cmds
          fi
          ;;
        completion) _describe 'shells' completion_cmds ;;
        archive) _describe 'subcommands' archive_cmds ;;
        branch) _describe 'subcommands' branch_cmds ;;
        favorite|pin) _describe 'subcommands' fav_cmds ;;
        skills) _describe 'subcommands' skills_cmds ;;
      esac
      ;;
  esac
}

compdef _grimoire grimoire grim
`;
}

/**
 * Generate fish completion script
 */
function generateFishCompletion(): string {
  return `# Grimoire fish completion with dynamic values

# Helper function to get prompt names dynamically
function __grimoire_prompts
  grimoire --cmplt-prompts 2>/dev/null
end

# Helper function to get worktree names dynamically
function __grimoire_worktrees
  grimoire --cmplt-worktrees 2>/dev/null
end

# Helper to check if we need worktree name completion
function __grimoire_needs_worktree
  set -l cmd (commandline -opc)
  if test (count $cmd) -ge 3
    if contains -- $cmd[2] wt worktree
      if contains -- $cmd[3] rm remove kill open path exec log logs claim release handoff merge commit pr adopt spawn status
        return 0
      end
    end
  end
  return 1
end

# Disable file completion by default
complete -c grimoire -f
complete -c grim -f

# Main commands
complete -c grimoire -n "__fish_use_subcommand" -a list -d "List all prompts"
complete -c grimoire -n "__fish_use_subcommand" -a add -d "Add a new prompt or skill"
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
complete -c grimoire -n "__fish_use_subcommand" -a skills -d "Manage agent skills"
complete -c grimoire -n "__fish_use_subcommand" -a spawn -d "Spawn Claude agent"
complete -c grimoire -n "__fish_use_subcommand" -a plugins -d "Manage Claude plugins"
complete -c grimoire -n "__fish_use_subcommand" -a stash -d "Stash clipboard content"
complete -c grimoire -n "__fish_use_subcommand" -a pop -d "Pop from stash"
complete -c grimoire -n "__fish_use_subcommand" -a tui -d "Launch TUI mode"
complete -c grimoire -n "__fish_use_subcommand" -a wt -d "Git worktree management"
complete -c grimoire -n "__fish_use_subcommand" -a worktree -d "Git worktree management"
complete -c grimoire -n "__fish_use_subcommand" -a dot -d "Browse dotfiles"
complete -c grimoire -n "__fish_use_subcommand" -a enhance -d "AI-powered prompt enhancement"
complete -c grimoire -n "__fish_use_subcommand" -a agents -d "Manage subagents"

# Dynamic prompt name completion (first argument that's not a command)
complete -c grimoire -n "__fish_use_subcommand" -a "(__grimoire_prompts)" -d "Prompt"

# Subcommands
complete -c grimoire -n "__fish_seen_subcommand_from templates" -a "list show vars create apply"
complete -c grimoire -n "__fish_seen_subcommand_from config" -a "llm"
complete -c grimoire -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
complete -c grimoire -n "__fish_seen_subcommand_from archive" -a "list show restore delete"
complete -c grimoire -n "__fish_seen_subcommand_from branch" -a "list create switch merge delete"
complete -c grimoire -n "__fish_seen_subcommand_from favorite pin" -a "list add remove"
complete -c grimoire -n "__fish_seen_subcommand_from skills" -a "init add enable disable list info search sync doctor update validate"

# Worktree subcommands
complete -c grimoire -n "__fish_seen_subcommand_from wt worktree" -a "ps new spawn kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"

# Dynamic worktree name completion for subcommands that need it
complete -c grimoire -n "__grimoire_needs_worktree" -a "(__grimoire_worktrees)" -d "Worktree"

# Duplicate all for grim alias
complete -c grim -n "__fish_use_subcommand" -a list -d "List all prompts"
complete -c grim -n "__fish_use_subcommand" -a add -d "Add a new prompt or skill"
complete -c grim -n "__fish_use_subcommand" -a show -d "Show prompt details"
complete -c grim -n "__fish_use_subcommand" -a edit -d "Edit a prompt"
complete -c grim -n "__fish_use_subcommand" -a rm -d "Delete a prompt"
complete -c grim -n "__fish_use_subcommand" -a copy -d "Copy prompt to clipboard"
complete -c grim -n "__fish_use_subcommand" -a test -d "Test a prompt with an LLM"
complete -c grim -n "__fish_use_subcommand" -a cost -d "Estimate token costs"
complete -c grim -n "__fish_use_subcommand" -a search -d "Search prompts"
complete -c grim -n "__fish_use_subcommand" -a reindex -d "Rebuild search index"
complete -c grim -n "__fish_use_subcommand" -a stats -d "Show statistics"
complete -c grim -n "__fish_use_subcommand" -a tag -d "Manage tags"
complete -c grim -n "__fish_use_subcommand" -a templates -d "Manage templates"
complete -c grim -n "__fish_use_subcommand" -a export -d "Export prompts"
complete -c grim -n "__fish_use_subcommand" -a import -d "Import prompts"
complete -c grim -n "__fish_use_subcommand" -a history -d "Show edit history"
complete -c grim -n "__fish_use_subcommand" -a versions -d "List versions"
complete -c grim -n "__fish_use_subcommand" -a rollback -d "Rollback to version"
complete -c grim -n "__fish_use_subcommand" -a archive -d "Manage archived prompts"
complete -c grim -n "__fish_use_subcommand" -a branch -d "Manage prompt branches"
complete -c grim -n "__fish_use_subcommand" -a alias -d "Manage aliases"
complete -c grim -n "__fish_use_subcommand" -a compare -d "A/B test prompts"
complete -c grim -n "__fish_use_subcommand" -a favorite -d "Manage favorites"
complete -c grim -n "__fish_use_subcommand" -a pin -d "Manage pinned prompts"
complete -c grim -n "__fish_use_subcommand" -a format -d "Format prompt content"
complete -c grim -n "__fish_use_subcommand" -a sync -d "Sync with remote"
complete -c grim -n "__fish_use_subcommand" -a completion -d "Generate shell completions"
complete -c grim -n "__fish_use_subcommand" -a config -d "Configure settings"
complete -c grim -n "__fish_use_subcommand" -a skills -d "Manage agent skills"
complete -c grim -n "__fish_use_subcommand" -a spawn -d "Spawn Claude agent"
complete -c grim -n "__fish_use_subcommand" -a plugins -d "Manage Claude plugins"
complete -c grim -n "__fish_use_subcommand" -a stash -d "Stash clipboard content"
complete -c grim -n "__fish_use_subcommand" -a pop -d "Pop from stash"
complete -c grim -n "__fish_use_subcommand" -a tui -d "Launch TUI mode"
complete -c grim -n "__fish_use_subcommand" -a wt -d "Git worktree management"
complete -c grim -n "__fish_use_subcommand" -a worktree -d "Git worktree management"
complete -c grim -n "__fish_use_subcommand" -a dot -d "Browse dotfiles"
complete -c grim -n "__fish_use_subcommand" -a enhance -d "AI-powered prompt enhancement"
complete -c grim -n "__fish_use_subcommand" -a agents -d "Manage subagents"
complete -c grim -n "__fish_use_subcommand" -a "(__grimoire_prompts)" -d "Prompt"
complete -c grim -n "__fish_seen_subcommand_from templates" -a "list show vars create apply"
complete -c grim -n "__fish_seen_subcommand_from config" -a "llm"
complete -c grim -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
complete -c grim -n "__fish_seen_subcommand_from archive" -a "list show restore delete"
complete -c grim -n "__fish_seen_subcommand_from branch" -a "list create switch merge delete"
complete -c grim -n "__fish_seen_subcommand_from favorite pin" -a "list add remove"
complete -c grim -n "__fish_seen_subcommand_from skills" -a "init add enable disable list info search sync doctor update validate"
complete -c grim -n "__fish_seen_subcommand_from wt worktree" -a "ps new spawn kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"
complete -c grim -n "__grimoire_needs_worktree" -a "(__grimoire_worktrees)" -d "Worktree"
`;
}
