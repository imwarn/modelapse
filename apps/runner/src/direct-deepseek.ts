import type { DirectDeepSeekRunRequest } from "@modelapse/control-plane";
import { DeepSeekResponsesAdapter } from "@modelapse/provider-deepseek";
import {
  runDirectProvider,
  type DirectProviderRunDependencies,
} from "./direct-provider.js";

export { parseDirectDeepSeekRunRequest } from "@modelapse/control-plane";
export type { DirectDeepSeekRunRequest } from "@modelapse/control-plane";

export type DirectDeepSeekRunDependencies = DirectProviderRunDependencies;

export async function runDirectDeepSeek(
  request: DirectDeepSeekRunRequest,
  deps: DirectDeepSeekRunDependencies,
) {
  return runDirectProvider(
    request,
    deps,
    new DeepSeekResponsesAdapter(),
    "modelapse-runner/deepseek-direct",
  );
}
