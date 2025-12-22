# Gotchas & Pitfalls

Things to watch out for in this codebase.

## [2025-12-22 04:37]
The malformed directory 'C:gitspunkapiscripts' referenced in the implementation plan does not exist in the worktrees. This was likely a path that got corrupted in a different environment or was already cleaned up.

_Context: subtask-2-2: Remove malformed directory. The verification passes because the directory doesn't exist, so no action was needed._

## [2025-12-22 05:06]
Docker commands (docker, docker-compose) are not available in the sandboxed build environment. Alternative verification approach: run npm builds locally which simulate the Docker build process.

_Context: subtask-5-2: Docker build verification in sandboxed environment_
