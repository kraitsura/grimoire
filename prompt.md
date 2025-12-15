Implement Phase 1 of Grimoire CLI using the beads issue tracker.

  ## Workflow
  1. Run `bd ready` to see available work
  2. Claim the Phase 1 epic: `bd update grimoire-oke --status=in_progress`
  3. Run `bd show grimoire-oke` to see all Phase 1 tasks
  4. For each task:
     - Read the task details with `bd show <task-id>`
     - Implement according to the description and acceptance criteria
     - Mark complete: `bd close <task-id>`
  5. After all tasks done, close the epic: `bd close grimoire-oke`
  6. Export for bv: `bd export -o .beads/issues.jsonl`
  7. Sync: `bd sync`

  ## Implementation Order (suggested)
  1. grimoire-jp6 - Initialize Bun project
  2. grimoire-70o - Configure TypeScript
  3. grimoire-36j - Create directory structure
  4. grimoire-5hf - Set up ESLint/Prettier
  5. grimoire-3ih - Define error types
  6. grimoire-cdl - Create service patterns
  7. grimoire-txe - Implement CLI entry point
  8. grimoire-4xg - Configure test runner

  ## Quality Standards
  - Follow Effect patterns in task descriptions
  - Use `Effect.gen` for effectful code
  - Define services with `Context.Tag` and `Layer`
  - All code must typecheck: `bun run typecheck`
  - All tests must pass: `bun test`

  Start by claiming the epic and working through each task.

  For subsequent phases, just change the phase number and epic ID:

  Continue implementing Grimoire CLI - Phase 2 (Database Architecture).

  Run `bd ready` to see available work, then claim grimoire-vii and implement all its tasks following the beads workflow.

  Tips for smooth execution:
  1. Keep tasks atomic - close each as you complete it
  2. Run tests frequently during implementation
  3. The task descriptions have code examples - use them as starting points
  4. Check bd show <id> for acceptance criteria before marking done
