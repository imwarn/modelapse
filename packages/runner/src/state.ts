import type { RunStatus } from "@modelapse/domain";

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  planned: ["executing", "blocked"],
  executing: ["response_captured", "failed_request", "timeout", "blocked"],
  response_captured: ["completed", "failed_request", "invalid_output", "artifact_failed"],
  completed: [],
  failed_request: [],
  blocked: [],
  timeout: [],
  invalid_output: [],
  artifact_failed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return transitions[from].includes(to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid run transition: ${from} -> ${to}`);
  }
}
