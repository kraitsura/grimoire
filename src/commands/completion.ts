/**
 * Completion Command - Generate shell completion scripts
 *
 * Updated for new 6-command structure:
 * - pl: Prompt Library
 * - wt: Worktree management
 * - st: Skills/Tools
 * - config: Configuration
 * - spawn: Spawn agent
 * - completion: Shell completions
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

  # Top-level commands (6 only)
  local commands="pl wt st config spawn completion"

  # Prompt Library subcommands
  local pl_cmds="list show rm copy search tag history versions rollback archive branch alias favorite pin format export import reindex stats templates test cost compare benchmark enhance sync stash pop"

  # Worktree subcommands
  local wt_cmds="ps new spawn kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"

  # Skills/Tools subcommands
  local st_cmds="skills plugins agents add"

  # Skills subcommands
  local skills_cmds="init add enable disable list info search sync doctor update validate"

  # Plugins subcommands
  local plugins_cmds="list add info"

  # Agents subcommands
  local agents_cmds="list create info"

  # Config subcommands
  local config_cmds="llm dot"

  # Worktree subcommands that need worktree name completion
  local wt_name_cmds="rm remove kill open path exec log logs claim release handoff merge commit pr adopt spawn status"

  case "$prev" in
    grimoire|grim)
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      return 0
      ;;
    pl)
      # Complete with pl subcommands + dynamic prompt names
      local prompts
      prompts=$(grimoire --cmplt-prompts 2>/dev/null)
      COMPREPLY=($(compgen -W "$pl_cmds $prompts" -- "$cur"))
      return 0
      ;;
    wt|worktree)
      COMPREPLY=($(compgen -W "$wt_cmds" -- "$cur"))
      return 0
      ;;
    st)
      COMPREPLY=($(compgen -W "$st_cmds" -- "$cur"))
      return 0
      ;;
    config)
      COMPREPLY=($(compgen -W "$config_cmds" -- "$cur"))
      return 0
      ;;
    completion)
      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))
      return 0
      ;;
    skills)
      if [[ "$cmd" == "st" ]]; then
        COMPREPLY=($(compgen -W "$skills_cmds" -- "$cur"))
        return 0
      fi
      ;;
    plugins)
      if [[ "$cmd" == "st" ]]; then
        COMPREPLY=($(compgen -W "$plugins_cmds" -- "$cur"))
        return 0
      fi
      ;;
    agents)
      if [[ "$cmd" == "st" ]]; then
        COMPREPLY=($(compgen -W "$agents_cmds" -- "$cur"))
        return 0
      fi
      ;;
    llm)
      if [[ "$cmd" == "config" ]]; then
        COMPREPLY=($(compgen -W "list add test remove" -- "$cur"))
        return 0
      fi
      ;;
    # pl subcommand completions
    templates)
      if [[ "$cmd" == "pl" ]]; then
        COMPREPLY=($(compgen -W "list show vars create apply" -- "$cur"))
        return 0
      fi
      ;;
    archive)
      if [[ "$cmd" == "pl" ]]; then
        COMPREPLY=($(compgen -W "list show restore delete" -- "$cur"))
        return 0
      fi
      ;;
    branch)
      if [[ "$cmd" == "pl" ]]; then
        COMPREPLY=($(compgen -W "list create switch merge delete" -- "$cur"))
        return 0
      fi
      ;;
    favorite|pin)
      if [[ "$cmd" == "pl" ]]; then
        COMPREPLY=($(compgen -W "list add remove" -- "$cur"))
        return 0
      fi
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
      # Check if we're completing a pl subcommand that needs a prompt name
      if [[ "$cmd" == "pl" ]]; then
        case "$subcmd" in
          show|rm|copy|test|cost|history|versions|rollback|enhance|format)
            local prompts
            prompts=$(grimoire --cmplt-prompts 2>/dev/null)
            COMPREPLY=($(compgen -W "$prompts" -- "$cur"))
            return 0
            ;;
        esac
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
  local -a commands

  # Top-level commands only (6)
  commands=(
    'pl:Prompt Library - manage prompts'
    'wt:Worktree - git worktree management'
    'st:Skills/Tools - manage skills, plugins, agents'
    'config:Configuration and settings'
    'spawn:Spawn Claude agent in current directory'
    'completion:Generate shell completions'
  )

  local -a pl_cmds=(
    'list:List all prompts'
    'show:Show prompt details'
    'rm:Delete a prompt'
    'copy:Copy prompt to clipboard'
    'search:Search prompts'
    'tag:Manage tags'
    'history:Show edit history'
    'versions:List versions'
    'rollback:Rollback to version'
    'archive:Manage archived prompts'
    'branch:Manage prompt branches'
    'alias:Manage aliases'
    'favorite:Manage favorites'
    'pin:Manage pinned prompts'
    'format:Format prompt content'
    'export:Export prompts'
    'import:Import prompts'
    'reindex:Rebuild search index'
    'stats:Show statistics'
    'templates:Manage templates'
    'test:Test prompt with LLM'
    'cost:Estimate token costs'
    'compare:A/B test prompts'
    'benchmark:Run test suite'
    'enhance:AI-powered enhancement'
    'sync:Sync with remote'
    'stash:Stash clipboard content'
    'pop:Pop from stash'
  )

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

  local -a st_cmds=(
    'skills:Manage agent skills'
    'plugins:Manage Claude plugins'
    'agents:Manage subagent definitions'
    'add:Add from GitHub or marketplace'
  )

  local -a skills_cmds=(init add enable disable list info search sync doctor update validate)
  local -a plugins_cmds=(list add info)
  local -a agents_cmds=(list create info)
  local -a config_cmds=(llm dot)
  local -a config_llm_cmds=(list add test remove)
  local -a completion_cmds=(bash zsh fish)
  local -a archive_cmds=(list show restore delete)
  local -a branch_cmds=(list create switch merge delete)
  local -a fav_cmds=(list add remove)
  local -a templates_cmds=(list show vars create apply)

  # Worktree subcommands that need name completion
  local -a wt_name_cmds=(rm remove kill open path exec log logs claim release handoff merge commit pr adopt spawn status)

  # pl subcommands that need prompt name completion
  local -a pl_name_cmds=(show rm copy test cost history versions rollback enhance format)

  _arguments -C \\
    '1: :->command' \\
    '*:: :->args' && return

  case \$state in
    command)
      _describe -t commands 'commands' commands
      ;;
    args)
      case \$words[1] in
        pl)
          if (( CURRENT == 2 )); then
            _describe -t subcommands 'subcommands' pl_cmds
            # Also complete prompt names dynamically
            local -a _prompts
            _prompts=("\${(@f)\$(grimoire --cmplt-prompts 2>/dev/null)}")
            if [[ -n "\$_prompts[1]" ]]; then
              _describe -t prompts 'prompts' _prompts
            fi
          elif (( CURRENT == 3 )); then
            # Check if subcommand needs prompt name
            case \$words[2] in
              show|rm|copy|test|cost|history|versions|rollback|enhance|format)
                local -a _prompts
                _prompts=("\${(@f)\$(grimoire --cmplt-prompts 2>/dev/null)}")
                [[ -n "\$_prompts[1]" ]] && _describe -t prompts 'prompts' _prompts
                ;;
              templates) _describe -t subcommands 'subcommands' templates_cmds ;;
              archive) _describe -t subcommands 'subcommands' archive_cmds ;;
              branch) _describe -t subcommands 'subcommands' branch_cmds ;;
              favorite|pin) _describe -t subcommands 'subcommands' fav_cmds ;;
            esac
          fi
          ;;
        wt|worktree)
          if (( CURRENT == 2 )); then
            _describe -t subcommands 'subcommands' wt_cmds
          elif (( CURRENT == 3 )); then
            # Check if subcommand needs worktree name
            case \$words[2] in
              rm|remove|kill|open|path|exec|log|logs|claim|release|handoff|merge|commit|pr|adopt|spawn|status)
                local -a _worktrees
                _worktrees=("\${(@f)\$(grimoire --cmplt-worktrees 2>/dev/null)}")
                [[ -n "\$_worktrees[1]" ]] && _describe -t worktrees 'worktrees' _worktrees
                ;;
            esac
          fi
          ;;
        st)
          if (( CURRENT == 2 )); then
            _describe -t subcommands 'subcommands' st_cmds
          elif (( CURRENT == 3 )); then
            case \$words[2] in
              skills) _describe -t subcommands 'subcommands' skills_cmds ;;
              plugins) _describe -t subcommands 'subcommands' plugins_cmds ;;
              agents) _describe -t subcommands 'subcommands' agents_cmds ;;
            esac
          fi
          ;;
        config)
          if (( CURRENT == 2 )); then
            _describe -t subcommands 'subcommands' config_cmds
          elif [[ \$words[2] == "llm" ]] && (( CURRENT == 3 )); then
            _describe -t subcommands 'subcommands' config_llm_cmds
          fi
          ;;
        completion) _describe -t shells 'shells' completion_cmds ;;
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
  return `# Grimoire fish completion - 6 command structure

# Helper function to get prompt names dynamically
function __grimoire_prompts
  grimoire --cmplt-prompts 2>/dev/null
end

# Helper function to get worktree names dynamically
function __grimoire_worktrees
  grimoire --cmplt-worktrees 2>/dev/null
end

# Check if we're in a pl context needing prompt name completion
function __grimoire_pl_needs_prompt
  set -l cmd (commandline -opc)
  if test (count $cmd) -ge 3
    if test "$cmd[2]" = pl
      if contains -- $cmd[3] show rm copy test cost history versions rollback enhance format
        return 0
      end
    end
  end
  return 1
end

# Check if we're in a wt context needing worktree name completion
function __grimoire_wt_needs_worktree
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

# Check if in st skills context
function __grimoire_st_skills
  set -l cmd (commandline -opc)
  test (count $cmd) -ge 2; and test "$cmd[2]" = st; and test (count $cmd) -ge 3; and test "$cmd[3]" = skills
end

# Check if in st plugins context
function __grimoire_st_plugins
  set -l cmd (commandline -opc)
  test (count $cmd) -ge 2; and test "$cmd[2]" = st; and test (count $cmd) -ge 3; and test "$cmd[3]" = plugins
end

# Check if in st agents context
function __grimoire_st_agents
  set -l cmd (commandline -opc)
  test (count $cmd) -ge 2; and test "$cmd[2]" = st; and test (count $cmd) -ge 3; and test "$cmd[3]" = agents
end

# Disable file completion by default
complete -c grimoire -f
complete -c grim -f

# Top-level commands (6 only)
complete -c grimoire -n "__fish_use_subcommand" -a pl -d "Prompt Library - manage prompts"
complete -c grimoire -n "__fish_use_subcommand" -a wt -d "Worktree - git worktree management"
complete -c grimoire -n "__fish_use_subcommand" -a st -d "Skills/Tools - manage skills, plugins, agents"
complete -c grimoire -n "__fish_use_subcommand" -a config -d "Configuration and settings"
complete -c grimoire -n "__fish_use_subcommand" -a spawn -d "Spawn Claude agent"
complete -c grimoire -n "__fish_use_subcommand" -a completion -d "Generate shell completions"

# pl subcommands
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a list -d "List all prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a show -d "Show prompt details"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a rm -d "Delete a prompt"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a copy -d "Copy to clipboard"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a search -d "Search prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a tag -d "Manage tags"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a history -d "Show edit history"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a versions -d "List versions"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a rollback -d "Rollback to version"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a archive -d "Manage archived prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a branch -d "Manage prompt branches"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a alias -d "Manage aliases"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a favorite -d "Manage favorites"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a pin -d "Manage pinned prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a format -d "Format prompt content"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a export -d "Export prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a import -d "Import prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a reindex -d "Rebuild search index"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a stats -d "Show statistics"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a templates -d "Manage templates"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a test -d "Test prompt with LLM"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a cost -d "Estimate token costs"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a compare -d "A/B test prompts"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a benchmark -d "Run test suite"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a enhance -d "AI-powered enhancement"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a sync -d "Sync with remote"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a stash -d "Stash clipboard content"
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a pop -d "Pop from stash"
# Dynamic prompt names for pl
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a "(__grimoire_prompts)" -d "Prompt"
complete -c grimoire -n "__grimoire_pl_needs_prompt" -a "(__grimoire_prompts)" -d "Prompt"

# wt subcommands
complete -c grimoire -n "__fish_seen_subcommand_from wt worktree" -a "ps new spawn kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"
complete -c grimoire -n "__grimoire_wt_needs_worktree" -a "(__grimoire_worktrees)" -d "Worktree"

# st subcommands
complete -c grimoire -n "__fish_seen_subcommand_from st" -a skills -d "Manage agent skills"
complete -c grimoire -n "__fish_seen_subcommand_from st" -a plugins -d "Manage Claude plugins"
complete -c grimoire -n "__fish_seen_subcommand_from st" -a agents -d "Manage subagent definitions"
complete -c grimoire -n "__fish_seen_subcommand_from st" -a add -d "Add from GitHub/marketplace"
complete -c grimoire -n "__grimoire_st_skills" -a "init add enable disable list info search sync doctor update validate"
complete -c grimoire -n "__grimoire_st_plugins" -a "list add info"
complete -c grimoire -n "__grimoire_st_agents" -a "list create info"

# config subcommands
complete -c grimoire -n "__fish_seen_subcommand_from config" -a llm -d "Configure LLM settings"
complete -c grimoire -n "__fish_seen_subcommand_from config" -a dot -d "Browse dotfiles"

# completion shells
complete -c grimoire -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"

# Duplicate for grim alias
complete -c grim -n "__fish_use_subcommand" -a pl -d "Prompt Library - manage prompts"
complete -c grim -n "__fish_use_subcommand" -a wt -d "Worktree - git worktree management"
complete -c grim -n "__fish_use_subcommand" -a st -d "Skills/Tools - manage skills, plugins, agents"
complete -c grim -n "__fish_use_subcommand" -a config -d "Configuration and settings"
complete -c grim -n "__fish_use_subcommand" -a spawn -d "Spawn Claude agent"
complete -c grim -n "__fish_use_subcommand" -a completion -d "Generate shell completions"

complete -c grim -n "__fish_seen_subcommand_from pl" -a "list show rm copy search tag history versions rollback archive branch alias favorite pin format export import reindex stats templates test cost compare benchmark enhance sync stash pop"
complete -c grim -n "__fish_seen_subcommand_from pl" -a "(__grimoire_prompts)" -d "Prompt"
complete -c grim -n "__grimoire_pl_needs_prompt" -a "(__grimoire_prompts)" -d "Prompt"

complete -c grim -n "__fish_seen_subcommand_from wt worktree" -a "ps new spawn kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"
complete -c grim -n "__grimoire_wt_needs_worktree" -a "(__grimoire_worktrees)" -d "Worktree"

complete -c grim -n "__fish_seen_subcommand_from st" -a "skills plugins agents add"
complete -c grim -n "__grimoire_st_skills" -a "init add enable disable list info search sync doctor update validate"
complete -c grim -n "__grimoire_st_plugins" -a "list add info"
complete -c grim -n "__grimoire_st_agents" -a "list create info"

complete -c grim -n "__fish_seen_subcommand_from config" -a "llm dot"
complete -c grim -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
`;
}
