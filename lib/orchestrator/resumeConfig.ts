import { isRecord } from "@/lib/typeGuards";
import { parseReasoningEffortParam, validateRequestedModel } from "@/lib/modelPolicy";
import type { ReasoningEffortLevel } from "@/constants/openai-models";

export interface ResumeConfig {
  model: string;
  reasoningEffort: ReasoningEffortLevel | null;
  usedPersisted: boolean;
}

/**
 * Resolve the model/effort for resuming an interrupted run. The configuration
 * that created the interrupt (persisted in its payload at creation time) always
 * wins over the picker's current values: changing model or effort while an
 * approval is pending must not alter the run the user reviewed. Interrupts
 * created before payloads carried config fall back to the picker values.
 */
export function resolveResumeConfig(
  pickerModel: string,
  pickerReasoningEffort: ReasoningEffortLevel | null,
  interruptValues: unknown[],
): ResumeConfig {
  const persisted = interruptValues
    .filter(isRecord)
    .find((value) => typeof value.model === "string");

  if (persisted) {
    const persistedModel = validateRequestedModel(persisted.model as string);
    if (persistedModel) {
      return {
        model: persistedModel,
        reasoningEffort:
          typeof persisted.reasoningEffort === "string"
            ? parseReasoningEffortParam(persisted.reasoningEffort)
            : null,
        usedPersisted: true,
      };
    }
  }

  return {
    model: pickerModel,
    reasoningEffort: pickerReasoningEffort,
    usedPersisted: false,
  };
}
