/**
 * Completion Command - Generate shell completion scripts
 */

import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

// Shell type argument - using text with manual validation
const shellArg = Args.text({ name: "shell" }).pipe(
  Args.optional,
  Args.withDescription("Shell type: bash, zsh, or fish")
);

/**
 * Completion command handler
 */
export const completionCommand = Command.make(
  "completion",
  { shell: shellArg },
  ({ shell }) =>
    Effect.sync(() => {
      if (shell._tag === "None") {
        console.log("Usage: grimoire completion <bash|zsh|fish>");
        console.log("\nGenerate shell completion scripts.");
        console.log("\nTo install:");
        console.log('  bash: eval "$(grimoire completion bash)"');
        console.log('  zsh:  eval "$(grimoire completion zsh)"');
        console.log("  fish: grimoire completion fish | source");
        console.log("\nAdd the eval line to your shell's rc file for persistence.");
        return;
      }

      const shellType = shell.value;
      switch (shellType) {
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
          console.log(`Unknown shell: ${shellType}`);
          console.log("Supported shells: bash, zsh, fish");
      }
    })
).pipe(Command.withDescription("Generate shell completions (bash/zsh/fish)"));

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

  # Top-level commands (6 namespaces + completion)
  local commands="pl ag wt st config profile completion"

  # Prompt Library subcommands
  local pl_cmds="list show rm copy search tag history versions rollback archive branch alias favorite pin format export import reindex stats templates test cost compare benchmark enhance sync stash pop"

  # Agent subcommands
  local ag_cmds="spawn scout ps kill wait"

  # Worktree subcommands
  local wt_cmds="ps new spawn scout kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"

  # Skills/Tools subcommands
  local st_cmds="skills plugins agents add"

  # Config subcommands
  local config_cmds="llm dot"

  # Profile subcommands
  local profile_cmds="list show create delete apply remove harnesses"

  case "$prev" in
    grimoire|grim)
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      return 0
      ;;
    pl)
      local prompts
      prompts=$(grimoire --cmplt-prompts 2>/dev/null)
      COMPREPLY=($(compgen -W "$pl_cmds $prompts" -- "$cur"))
      return 0
      ;;
    ag)
      COMPREPLY=($(compgen -W "$ag_cmds" -- "$cur"))
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
    profile)
      COMPREPLY=($(compgen -W "$profile_cmds" -- "$cur"))
      return 0
      ;;
    completion)
      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))
      return 0
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

  commands=(
    'pl:Prompt Library - manage prompts'
    'ag:Agents - spawn agents in current directory'
    'wt:Worktree - isolated workspaces + agents'
    'st:Skills/Tools - manage skills, plugins, agents'
    'config:Configuration and settings'
    'profile:Profile management'
    'completion:Generate shell completions'
  )

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
          _values 'subcommand' list show rm copy search tag history versions rollback archive branch alias favorite pin format export import reindex stats templates test cost compare benchmark enhance sync stash pop
          ;;
        ag)
          _values 'subcommand' spawn scout ps kill wait
          ;;
        wt|worktree)
          _values 'subcommand' ps new spawn scout kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available
          ;;
        st)
          _values 'subcommand' skills plugins agents add
          ;;
        config)
          _values 'subcommand' llm dot
          ;;
        profile)
          _values 'subcommand' list show create delete apply remove harnesses
          ;;
        completion)
          _values 'shell' bash zsh fish
          ;;
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
  return `# Grimoire fish completion

# Disable file completion by default
complete -c grimoire -f
complete -c grim -f

# Top-level commands
complete -c grimoire -n "__fish_use_subcommand" -a pl -d "Prompt Library - manage prompts"
complete -c grimoire -n "__fish_use_subcommand" -a ag -d "Agents - spawn in current directory"
complete -c grimoire -n "__fish_use_subcommand" -a wt -d "Worktree - isolated workspaces + agents"
complete -c grimoire -n "__fish_use_subcommand" -a st -d "Skills/Tools - manage skills, plugins, agents"
complete -c grimoire -n "__fish_use_subcommand" -a config -d "Configuration and settings"
complete -c grimoire -n "__fish_use_subcommand" -a profile -d "Profile management"
complete -c grimoire -n "__fish_use_subcommand" -a completion -d "Generate shell completions"

# pl subcommands
complete -c grimoire -n "__fish_seen_subcommand_from pl" -a "list show rm copy search tag history versions rollback archive branch alias favorite pin format export import reindex stats templates test cost compare benchmark enhance sync stash pop"

# ag subcommands
complete -c grimoire -n "__fish_seen_subcommand_from ag" -a "spawn scout ps kill wait"

# wt subcommands
complete -c grimoire -n "__fish_seen_subcommand_from wt worktree" -a "ps new spawn scout kill children wait collect commit merge pr auth from-issue list ls status rm remove path exec open clean adopt config each log logs checkpoint checkpoints claim release handoff available"

# st subcommands
complete -c grimoire -n "__fish_seen_subcommand_from st" -a "skills plugins agents add"

# config subcommands
complete -c grimoire -n "__fish_seen_subcommand_from config" -a "llm dot"

# profile subcommands
complete -c grimoire -n "__fish_seen_subcommand_from profile" -a "list show create delete apply remove harnesses"

# completion shells
complete -c grimoire -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"

# Duplicate for grim alias
complete -c grim -n "__fish_use_subcommand" -a pl -d "Prompt Library"
complete -c grim -n "__fish_use_subcommand" -a ag -d "Agents"
complete -c grim -n "__fish_use_subcommand" -a wt -d "Worktree"
complete -c grim -n "__fish_use_subcommand" -a st -d "Skills/Tools"
complete -c grim -n "__fish_use_subcommand" -a config -d "Configuration"
complete -c grim -n "__fish_use_subcommand" -a profile -d "Profile"
complete -c grim -n "__fish_use_subcommand" -a completion -d "Completions"
`;
}
