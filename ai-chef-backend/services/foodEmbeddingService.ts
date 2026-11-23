import { config } from "../config";

const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_TIMEOUT_MS = 120000;

interface OllamaEmbeddingResponse {
  embedding?: unknown;
}

export async function generateFoodEmbedding(
  foodName: string,
  description: string,
  ingredients: string[],
  operationSignal?: AbortSignal
): Promise<number[]> {
  const cleanName = foodName.trim();
  const cleanDescription = description.trim();
  const cleanIngredients = ingredients
    .map((ingredient) => ingredient.trim())
    .filter(Boolean);

  const embeddingText = [
    `Food: ${cleanName}`,
    `Description: ${cleanDescription}`,
    cleanIngredients.length > 0
      ? `Ingredients: ${cleanIngredients.join(", ")}`
      : undefined,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n");

  const timeoutSignal = AbortSignal.timeout(EMBEDDING_TIMEOUT_MS);
  const requestController = new AbortController();
  const abortFromOperation = () =>
    requestController.abort(operationSignal?.reason);
  const abortFromTimeout = () =>
    requestController.abort(timeoutSignal.reason);

  if (operationSignal?.aborted) {
    abortFromOperation();
  } else {
    operationSignal?.addEventListener("abort", abortFromOperation, { once: true });
  }
  timeoutSignal.addEventListener("abort", abortFromTimeout, { once: true });

  try {
    let response: Response;

    try {
      response = await fetch(
        `${config.ollamaUrl.replace(/\/$/, "")}/api/embeddings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.ollamaEmbeddingModel,
            prompt: embeddingText,
          }),
          signal: requestController.signal,
        }
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Ollama embedding request timed out");
      }

      throw new Error("Could not connect to the Ollama embedding service");
    }

    if (!response.ok) {
      throw new Error(
        `Ollama embedding request failed with status ${response.status}`
      );
    }

    let data: OllamaEmbeddingResponse;

    try {
      data = (await response.json()) as OllamaEmbeddingResponse;
    } catch {
      throw new Error("Ollama returned an invalid embedding response");
    }

    if (
      !Array.isArray(data.embedding) ||
      data.embedding.length !== EMBEDDING_DIMENSIONS ||
      !data.embedding.every(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value)
      )
    ) {
      throw new Error(
        `Ollama must return exactly ${EMBEDDING_DIMENSIONS} numeric embedding values`
      );
    }

    return data.embedding;
  } finally {
    operationSignal?.removeEventListener("abort", abortFromOperation);
    timeoutSignal.removeEventListener("abort", abortFromTimeout);
  }
}
