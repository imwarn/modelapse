import type { DirectOpenAIRunRequest } from "@modelapse/control-plane";
import { OpenAIResponsesAdapter } from "@modelapse/provider-openai";
import {
  runDirectProvider,
  type DirectProviderRunDependencies,
} from "./direct-provider.js";

export { parseDirectOpenAIRunRequest } from "@modelapse/control-plane";
export type { DirectOpenAIRunRequest } from "@modelapse/control-plane";

export type DirectOpenAIRunDependencies = DirectProviderRunDependencies;

export async function runDirectOpenAI(
  request: DirectOpenAIRunRequest,
  deps: DirectOpenAIRunDependencies,
) {
  return runDirectProvider(
    request,
    deps,
    new OpenAIResponsesAdapter(),
    "modelapse-runner/openai-direct",
  );
}
