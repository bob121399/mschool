// Spec 5.2 file contract. The runtime instructions are composed in prompts/ (common prefix 3.1 +
// agent prompt 3.x + the 5.2 operational text). See docs/spec-errata.md E-SPEC-04.
import { TUTOR, ASSESSOR } from "@/prompts";

export const TUTOR_PROMPT = TUTOR.instructions;
export const TUTOR_PROMPT_VERSION = TUTOR.version;
export const ASSESSOR_PROMPT = ASSESSOR.instructions;
export const ASSESSOR_PROMPT_VERSION = ASSESSOR.version;
