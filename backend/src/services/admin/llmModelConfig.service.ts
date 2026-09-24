import * as path from "node:path";
import {
  findCatalogOption,
  loadModelOptionsFromCatalog,
  resolveBedrockModelId,
  type LlmModelOption as CatalogModelOption,
} from "../../config/modelsCatalog.js";
import {
  normalizeBedrockModelAlias,
  isBedrockProviderModelId,
  resolveBedrockInvokeModelId,
  stripBedrockGeoPrefix,
} from "../../utils/bedrockModelId.js";
import { upsertEnvFile } from "../../utils/envFile.js";
import { backendRoot } from "../../utils/backendRoot.js";
import {
  invokeBedrockModelTest,
  invokeInferenceProfileTest,
  resolveWorkingInvokeIdForProfile,
} from "./bedrockModelTest.service.js";
import {
  fetchAllInferenceProfiles,
  findInferenceProfileById,
  findProfileForActiveModel,
  getProfileOptionId,
  inferenceProfilesEnabled,
} from "./bedrockInferenceProfiles.service.js";
import {
  buildModelFulfillmentResponse,
  printModelFulfillmentToTerminal,
  type ModelFulfillmentResponse,
} from "../../utils/modelFulfillmentResponse.js";

const envLocalPath = path.join(backendRoot, ".env.local");

export type LlmBackend = "bedrock" | "local" | "openai" | "sagemaker" | "cisco";

export type LlmModelOption = CatalogModelOption | {
  id: string;
  label: string;
  backend: LlmBackend;
};

/**
 * AI-Q defaults to Bedrock (agents already use BEDROCK_MODEL_ID).
 * Explicit USE_* flags still override when set.
 */
function activeBackend(): LlmBackend {
  if (process.env.USE_SAGEMAKER === "true") return "sagemaker";
  if (process.env.USE_OPENAI === "true") return "openai";
  if (process.env.USE_CISCO === "true") return "cisco";
  if (process.env.USE_BEDROCK === "false") return "local";
  return "bedrock";
}

function currentModelId(): string {
  const backend = activeBackend();
  if (backend === "bedrock") {
    const raw =
      process.env.BEDROCK_MODEL?.trim() ||
      process.env.BEDROCK_MODEL_ID?.trim() ||
      "";
    return normalizeBedrockModelAlias(raw);
  }
  if (backend === "openai") {
    return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  }
  if (backend === "sagemaker") {
    return process.env.SAGEMAKER_MODEL_NAME?.trim() || "foundation-sec-8b";
  }
  if (backend === "cisco") {
    return process.env.CISCO_MODEL_NAME?.trim() || "foundation-sec-8b";
  }
  return process.env.LOCAL_MODEL_ID?.trim() || "Qwen/Qwen2.5-3B-Instruct";
}

function findOption(modelId: string): LlmModelOption | undefined {
  if (inferenceProfilesEnabled() && activeBackend() === "bedrock") {
    const profiles = cachedInferenceProfileOptions;
    if (profiles) {
      const match = profiles.find((option) => option.id === modelId);
      if (match) return match;
    }
  }
  return findCatalogOption(modelId);
}

let cachedInferenceProfileOptions: LlmModelOption[] | null = null;

async function listInferenceProfileOptions(): Promise<LlmModelOption[]> {
  if (!inferenceProfilesEnabled()) return [];

  const profiles = await fetchAllInferenceProfiles();
  const options: LlmModelOption[] = [];

  for (const profile of profiles) {
    const id = getProfileOptionId(profile);
    const label = profile.inferenceProfileName?.trim() || profile.modelId || id;
    if (!id || !label) continue;
    options.push({
      id,
      label,
      backend: "bedrock",
    });
  }

  cachedInferenceProfileOptions = options;
  return options;
}

function listOptions(): LlmModelOption[] {
  if (cachedInferenceProfileOptions?.length) {
    return [...cachedInferenceProfileOptions];
  }
  const options = loadModelOptionsFromCatalog();
  const current = currentModelId();

  if (current && !findCatalogOption(current)) {
    return [
      {
        id: current,
        label: `Current (${current})`,
        backend: activeBackend(),
      },
      ...options,
    ];
  }

  return options;
}

async function listOptionsAsync(): Promise<LlmModelOption[]> {
  if (inferenceProfilesEnabled() && activeBackend() === "bedrock") {
    try {
      const profiles = await fetchAllInferenceProfiles();
      const profileOptions: LlmModelOption[] = [];

      for (const profile of profiles) {
        const id = getProfileOptionId(profile);
        const label = profile.inferenceProfileName?.trim() || profile.modelId || id;
        if (!id || !label) continue;
        profileOptions.push({ id, label, backend: "bedrock" });
      }

      cachedInferenceProfileOptions = profileOptions;

      if (profileOptions.length > 0) {
        const current = currentModelId();
        const activeProfile = current
          ? findProfileForActiveModel(current, profiles)
          : undefined;

        if (
          activeProfile &&
          !profileOptions.some((o) => o.id === getProfileOptionId(activeProfile))
        ) {
          return [
            {
              id: getProfileOptionId(activeProfile),
              label:
                activeProfile.inferenceProfileName ||
                getProfileOptionId(activeProfile),
              backend: "bedrock",
            },
            ...profileOptions,
          ];
        }

        return profileOptions;
      }
    } catch (err) {
      console.error("[llmModelConfig] Failed to load inference profiles:", err);
    }
  }

  return listOptions();
}

function isBedrockModel(modelId: string): boolean {
  return (
    Boolean(findCatalogOption(modelId)) ||
    Boolean(findInferenceProfileById(modelId)) ||
    modelId.startsWith("us.anthropic.") ||
    modelId.startsWith("anthropic.") ||
    modelId.startsWith("claude-") ||
    modelId.startsWith("arn:aws:bedrock:") ||
    isBedrockProviderModelId(modelId)
  );
}

function isInferenceProfileSelection(modelId: string): boolean {
  if (!inferenceProfilesEnabled()) return false;
  if (!cachedInferenceProfileOptions?.some((o) => o.id === modelId)) {
    return false;
  }
  return Boolean(findInferenceProfileById(modelId));
}

function envUpdatesForModel(modelId: string, invokeModelId?: string): Record<string, string> {
  const option = findOption(modelId);
  const backend = option?.backend ?? (isBedrockModel(modelId) ? "bedrock" : activeBackend());

  const base: Record<string, string> = {
    USE_BEDROCK: "false",
    USE_SAGEMAKER: "false",
    USE_OPENAI: "false",
    USE_CISCO: "false",
  };

  if (backend === "bedrock" || isBedrockModel(modelId) || isInferenceProfileSelection(modelId)) {
    const resolved = invokeModelId?.trim() || resolveBedrockModelId(modelId);
    return {
      ...base,
      USE_BEDROCK: "true",
      BEDROCK_MODEL: resolved,
      BEDROCK_MODEL_ID: resolved,
    };
  }

  if (backend === "openai") {
    return {
      ...base,
      USE_OPENAI: "true",
      OPENAI_MODEL: modelId,
    };
  }

  if (backend === "local") {
    return {
      ...base,
      LOCAL_MODEL_ID: modelId,
    };
  }

  throw new Error(`Unsupported model: ${modelId}`);
}

function applyEnvToProcess(updates: Record<string, string>): void {
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

/** Prefer AI-Q scoring URL; fall back to ARI ingest URL naming. */
function pythonUrl(): string {
  return (
    process.env.PYTHON_SCORING_URL?.trim() ||
    process.env.PYTHON_INGEST_URL?.trim() ||
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

/** Canonical id so global.X / us.X / ARN / :200k suffixes compare as one model. */
function canonicalModelKey(modelId: string): string {
  let id = resolveBedrockInvokeModelId(modelId.trim()).toLowerCase();
  if (!id) return "";
  if (id.startsWith("arn:aws:bedrock:")) {
    const slash = id.lastIndexOf("/");
    if (slash >= 0) id = id.slice(slash + 1);
  }
  return stripBedrockGeoPrefix(id);
}

function sameModelId(a: string, b: string): boolean {
  const left = canonicalModelKey(a);
  const right = canonicalModelKey(b);
  return left !== "" && left === right;
}

function matchesAnyModelId(actual: string, candidates: string[]): boolean {
  return candidates.some((candidate) => candidate.trim() && sameModelId(actual, candidate));
}

type PythonSyncOutcome = {
  ok: boolean;
  requiresPythonRestart?: boolean;
  pythonModelId?: string;
  error?: string;
};

/**
 * Sync to Python `/config/llm-model`.
 * Failures do not block the Node apply, but they are reported so Controls can warn:
 * Python keeps its own BEDROCK_MODEL_ID, so a missed sync silently leaves VTS scoring
 * on the previous model.
 */
async function syncPythonModel(modelId: string): Promise<PythonSyncOutcome> {
  const url = `${pythonUrl()}/config/llm-model`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).trim();
      return {
        ok: false,
        error:
          `Python scoring service rejected the model (HTTP ${res.status})` +
          (detail ? `: ${detail.slice(0, 200)}` : ""),
      };
    }
    const data = (await res.json()) as {
      modelId?: string;
      requiresPythonRestart?: boolean;
    };
    return {
      ok: true,
      requiresPythonRestart: data.requiresPythonRestart,
      pythonModelId: typeof data.modelId === "string" ? data.modelId.trim() : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Python scoring service unreachable at ${url}: ${message}`,
    };
  }
}

/** Read the model Python is actually scoring with, to detect drift from Node. */
async function probePythonModel(): Promise<{ modelId?: string; error?: string }> {
  const url = `${pythonUrl()}/config/llm-model`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return { error: `Python scoring service returned HTTP ${res.status} for ${url}` };
    }
    const data = (await res.json()) as { modelId?: string };
    const modelId = typeof data.modelId === "string" ? data.modelId.trim() : "";
    if (!modelId) {
      return { error: `Python scoring service did not report a model at ${url}` };
    }
    return { modelId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Python scoring service unreachable at ${url}: ${message}` };
  }
}

/**
 * Compare Node's active Bedrock model against Python's.
 * Only Bedrock is synced to Python; other backends are scored in Node only.
 */
async function resolvePythonSyncState(
  backend: LlmBackend,
  ...candidateModelIds: string[]
): Promise<Pick<LlmModelConfig, "pythonSynced" | "pythonModelId" | "pythonSyncError">> {
  if (backend !== "bedrock") {
    return { pythonSynced: true };
  }
  const probe = await probePythonModel();
  if (probe.error != null || !probe.modelId) {
    return { pythonSynced: false, pythonSyncError: probe.error };
  }
  if (!matchesAnyModelId(probe.modelId, candidateModelIds)) {
    return {
      pythonSynced: false,
      pythonModelId: probe.modelId,
      pythonSyncError:
        `Python scoring service is still using ${probe.modelId}. ` +
        "VTS scoring will not use the model selected here until the sync succeeds.",
    };
  }
  return { pythonSynced: true, pythonModelId: probe.modelId };
}

export type LlmModelConfig = {
  backend: LlmBackend;
  modelId: string;
  modelLabel: string;
  options: LlmModelOption[];
  /** True only when Python confirmed the same active model. */
  pythonSynced: boolean;
  /** Model Python reports as active, when reachable. */
  pythonModelId?: string;
  /** Why Python is not in sync, for display in Controls. */
  pythonSyncError?: string;
  requiresPythonRestart: boolean;
  inferenceProfiles?: boolean;
};

export async function getLlmModelConfigAsync(): Promise<LlmModelConfig> {
  const backend = activeBackend();
  const rawModelId = currentModelId();
  const options = await listOptionsAsync();

  let modelId = rawModelId;
  let option = findOption(modelId);

  if (!option && inferenceProfilesEnabled() && backend === "bedrock" && rawModelId) {
    const profiles = await fetchAllInferenceProfiles();
    const activeProfile = findProfileForActiveModel(rawModelId, profiles);
    if (activeProfile) {
      option = {
        id: getProfileOptionId(activeProfile),
        label:
          activeProfile.inferenceProfileName || getProfileOptionId(activeProfile),
        backend: "bedrock",
      };
      modelId = option.id;
    }
  }

  if (!option && backend === "bedrock" && rawModelId && !isInferenceProfileSelection(rawModelId)) {
    modelId = resolveBedrockModelId(rawModelId);
    option = findOption(modelId) ?? findCatalogOption(modelId);
  }

  const pythonState = await resolvePythonSyncState(
    backend,
    rawModelId,
    option?.id ?? modelId,
  );

  return {
    backend,
    modelId: option?.id ?? modelId,
    modelLabel: option?.label ?? modelId,
    options,
    ...pythonState,
    requiresPythonRestart: backend === "local",
    inferenceProfiles:
      inferenceProfilesEnabled() &&
      options.length > 0 &&
      Boolean(cachedInferenceProfileOptions?.length),
  };
}

export function getLlmModelConfig(): LlmModelConfig {
  const backend = activeBackend();
  let modelId = currentModelId();
  if (backend === "bedrock" && modelId) {
    modelId = resolveBedrockModelId(modelId);
  }
  const option = findOption(modelId);

  return {
    backend,
    modelId: option?.id ?? modelId,
    modelLabel: option?.label ?? modelId,
    options: listOptions(),
    // Python state needs a network call; use getLlmModelConfigAsync when it matters.
    pythonSynced: false,
    pythonSyncError: "Python sync state was not checked.",
    requiresPythonRestart: backend === "local",
    inferenceProfiles: inferenceProfilesEnabled(),
  };
}

export type LlmModelValidationResult = {
  success: boolean;
  message: string;
  modelId?: string;
  invokeModelId?: string;
  response?: string;
  latencyMs?: number;
  fulfillmentResponse?: ModelFulfillmentResponse;
  workingVia?: string;
  profileTest?: import("./bedrockInferenceProfiles.service.js").InferenceProfileTestResult;
};

export async function validateLlmModel(
  modelId: string,
): Promise<LlmModelValidationResult> {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return {
      success: false,
      message: "This model is not supported",
    };
  }

  if (inferenceProfilesEnabled()) {
    await listInferenceProfileOptions();
    if (isInferenceProfileSelection(trimmed)) {
      return invokeInferenceProfileTest(trimmed);
    }
  }

  const catalogOption = findCatalogOption(trimmed);
  if (
    !catalogOption &&
    activeBackend() === "bedrock" &&
    !isBedrockModel(trimmed)
  ) {
    return {
      success: false,
      message: "This model is not supported",
    };
  }

  try {
    envUpdatesForModel(trimmed);
  } catch {
    return {
      success: false,
      message: "This model is not supported",
    };
  }

  const backend = catalogOption?.backend ?? (isBedrockModel(trimmed) ? "bedrock" : activeBackend());
  if (backend === "bedrock" || isBedrockModel(trimmed)) {
    return invokeBedrockModelTest(trimmed);
  }

  const fulfillmentResponse = buildModelFulfillmentResponse({
    success: true,
    text: "Model works",
    modelId: trimmed,
  });
  printModelFulfillmentToTerminal("LLM model test", fulfillmentResponse);
  return {
    success: true,
    message: "Model works",
    modelId: trimmed,
    fulfillmentResponse,
  };
}

export async function setLlmModel(modelId: string): Promise<LlmModelConfig> {
  const trimmed = modelId.trim();
  if (!trimmed) {
    throw new Error("modelId is required");
  }

  let invokeModelId: string | undefined;

  if (inferenceProfilesEnabled()) {
    await listInferenceProfileOptions();
    if (isInferenceProfileSelection(trimmed)) {
      const workingId = await resolveWorkingInvokeIdForProfile(trimmed, {
        forceRetest: false,
      });
      if (!workingId) {
        throw new Error(
          "Inference profile test failed. Run Test before Apply, or choose another profile.",
        );
      }
      invokeModelId = workingId;
    }
  }

  const catalogOption = findCatalogOption(trimmed);
  if (!catalogOption && !invokeModelId && activeBackend() === "bedrock" && !isBedrockModel(trimmed)) {
    throw new Error(`Model not found: ${trimmed}`);
  }

  const updates = envUpdatesForModel(trimmed, invokeModelId);
  applyEnvToProcess(updates);
  upsertEnvFile(envLocalPath, updates);

  console.log("[LLM] model changed (Controls Apply)", {
    selectedModelId: trimmed,
    invokeModelId: invokeModelId ?? null,
    BEDROCK_MODEL: updates.BEDROCK_MODEL ?? null,
    BEDROCK_MODEL_ID: updates.BEDROCK_MODEL_ID ?? null,
    activeAfterApply: getActiveBedrockModelIdSafe(),
  });

  // Python holds its own BEDROCK_MODEL_ID for VTS scoring, so a failed sync must be
  // reported — otherwise Controls shows the new model while Python keeps scoring on the old one.
  const syncedId = updates.BEDROCK_MODEL ?? trimmed;
  const python = await syncPythonModel(syncedId);
  console.log("[LLM] Python sync after model change:", {
    ok: python.ok,
    modelSynced: syncedId,
    pythonModelId: python.pythonModelId ?? null,
    requiresPythonRestart: python.requiresPythonRestart ?? null,
    error: python.error ?? null,
  });

  const config = await getLlmModelConfigAsync();
  if (!python.ok) {
    config.pythonSynced = false;
    config.pythonSyncError = python.error ?? "Python scoring service sync failed.";
  } else if (
    python.pythonModelId &&
    matchesAnyModelId(python.pythonModelId, [syncedId, trimmed])
  ) {
    // PUT already confirmed the model; don't let a follow-up GET lose that
    // (uvicorn --reload can restart while Node re-probes).
    config.pythonSynced = true;
    config.pythonModelId = python.pythonModelId;
    delete config.pythonSyncError;
  }
  if (python.ok && python.requiresPythonRestart != null) {
    config.requiresPythonRestart = python.requiresPythonRestart;
  }

  return config;
}

/** Log-friendly active model without nested getActiveBedrockModelId spam during Apply. */
function getActiveBedrockModelIdSafe(): string {
  const raw =
    process.env.BEDROCK_MODEL?.trim() ||
    process.env.BEDROCK_MODEL_ID?.trim() ||
    "";
  return normalizeBedrockModelAlias(raw);
}
