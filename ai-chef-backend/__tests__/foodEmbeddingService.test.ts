import { generateFoodEmbedding } from "../services/foodEmbeddingService";

describe("generateFoodEmbedding cancellation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("aborting during response-body parsing cancels the body read", async () => {
    const operationController = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let bodyReadStarted!: () => void;
    const bodyReadStartedPromise = new Promise<void>((resolve) => {
      bodyReadStarted = resolve;
    });

    jest.spyOn(global, "fetch").mockImplementation(
      (async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal as AbortSignal;

        return {
          ok: true,
          status: 200,
          json: () => {
            bodyReadStarted();
            return new Promise((_resolve, reject) => {
              requestSignal?.addEventListener(
                "abort",
                () => reject(requestSignal?.reason),
                { once: true }
              );
            });
          },
        } as Response;
      }) as typeof fetch
    );

    const embeddingPromise = generateFoodEmbedding(
      "Chicken noodles",
      "A savory noodle dish",
      ["chicken", "noodles"],
      operationController.signal
    );

    await bodyReadStartedPromise;
    operationController.abort();

    await expect(embeddingPromise).rejects.toThrow(
      "Ollama returned an invalid embedding response"
    );
    expect(requestSignal?.aborted).toBe(true);
  });
});
