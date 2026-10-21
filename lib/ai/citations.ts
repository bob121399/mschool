/** Tutor citations (spec 2.4/RAG-01): every cited id must be one that the server actually passed to
 * the model; an answer that is not marked insufficient must cite at least one source. */
export function citationProblem(sourceIds: string[], allowed: ReadonlySet<string>, insufficientContext: boolean): "AI_INVALID_CITATIONS" | null {
  const ids = [...new Set(sourceIds)];
  if (ids.some((id) => !allowed.has(id)) || (!insufficientContext && ids.length === 0)) return "AI_INVALID_CITATIONS";
  return null;
}
