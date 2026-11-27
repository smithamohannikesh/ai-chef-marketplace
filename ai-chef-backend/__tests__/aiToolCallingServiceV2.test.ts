import { executeSearchFoodsTool } from "../aiChefV2/tools/foodSearchTool";
import {
  AiToolCallingServiceError,
  runAiToolCallingConversation,
} from "../aiChefV2/services/aiToolCallingService";
import type { FoodSearchRecord } from "../aiChefV2/types/foodTypes";

jest.mock("../aiChefV2/tools/foodSearchTool", () => {
  const actual = jest.requireActual("../aiChefV2/tools/foodSearchTool");
  return { ...actual, executeSearchFoodsTool: jest.fn() };
});

const mockExecuteSearchFoodsTool = executeSearchFoodsTool as jest.Mock;
const fetchMock = jest.spyOn(globalThis, "fetch");
let infoSpy: jest.SpyInstance;

function ollamaResponse(message: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ message }),
  } as Response;
}

function searchFoodsCall(foodName = "chicken biryani") {
  return {
    function: {
      name: "searchFoods",
      arguments: { foodName },
    },
  };
}

function foodRecord(
  id: number | string,
  name: string,
  chefName = "Chef A"
): FoodSearchRecord {
  return {
    id,
    chef_id: "chef-1",
    chef_name: chefName,
    name,
    description: `${name} description`,
    price: "12.50",
    image_key: `${id}.jpg`,
    ingredients: ["rice", "chicken"],
    is_available: true,
  };
}

function toolResult(records: FoodSearchRecord[]) {
  return {
    toolName: "searchFoods",
    success: true,
    content: JSON.stringify({ foods: records }),
    structuredData: records,
  };
}

function readLogs(): Array<Record<string, unknown>> {
  return infoSpy.mock.calls.map(
    ([entry]) => JSON.parse(String(entry)) as Record<string, unknown>
  );
}

function serializedLogs(): string {
  return infoSpy.mock.calls.map(([entry]) => String(entry)).join("\n");
}

describe("AI Chef V2 tool-calling service", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockExecuteSearchFoodsTool.mockReset();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  test("returns a normal assistant response with the grounding system instruction", async () => {
    fetchMock.mockResolvedValue(
      ollamaResponse({ role: "assistant", content: "Hello!" })
    );

    await expect(runAiToolCallingConversation("Hi")).resolves.toEqual({
      answer: "Hello!",
      foodRecords: [],
      searchStatus: "unavailable",
      responseSource: "ollama",
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/chat$/);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Never invent or infer food names");
    expect(body.messages[0].content).toContain(
      "call searchFoods before answering"
    );
    expect(body.messages[1]).toEqual({ role: "user", content: "Hi" });
    expect(body.tools).toEqual([expect.objectContaining({
      function: expect.objectContaining({ name: "searchFoods" }),
    })]);
    expect(body.tools[0].function.parameters.properties).not.toHaveProperty("limit");
    expect(body.options.temperature).toBe(0);
    expect(request?.signal).toBeDefined();
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "final_response_received",
      responseSource: "ollama",
      requestId: expect.any(String),
      timestamp: expect.any(String),
    }));
    expect(readLogs().every((entry) =>
      typeof entry.requestId === "string" &&
      typeof entry.timestamp === "string"
    )).toBe(true);
  });

  test("returns Ollama text separately from verified records, even if the text hallucinates details", async () => {
    const verified = foodRecord(1, "Kerala Chicken Dum Biryani");
    fetchMock
      .mockResolvedValueOnce(
        ollamaResponse({
          role: "assistant",
          content: "",
          tool_calls: [searchFoodsCall()],
        })
      )
      .mockResolvedValueOnce(
        ollamaResponse({
          role: "assistant",
          content: "Try Dragon Biryani for $1, made by Chef Fake.",
        })
      );
    mockExecuteSearchFoodsTool.mockResolvedValueOnce(toolResult([verified]));

    const result = await runAiToolCallingConversation("Find chicken biryani");

    expect(result).toEqual({
      answer: "Try Dragon Biryani for $1, made by Chef Fake.",
      foodRecords: [verified],
      searchStatus: "complete",
      responseSource: "ollama",
    });
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(secondRequest.messages.at(-1)).toEqual({
      role: "tool",
      tool_name: "searchFoods",
      content: JSON.stringify({ foods: [verified] }),
    });
    expect(result.foodRecords).not.toContainEqual(
      expect.objectContaining({ name: "Dragon Biryani", price: 1 })
    );
    expect(mockExecuteSearchFoodsTool).toHaveBeenCalledWith({
      foodName: "chicken biryani",
    });
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "tool_call_detected",
      tool: "searchFoods",
      registered: true,
      requestId: expect.any(String),
      timestamp: expect.any(String),
    }));
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "tool_result_returned",
      success: true,
      resultCount: 1,
      addedToConversation: true,
    }));
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "final_response_received",
      responseSource: "ollama",
    }));
  });

  test("treats a successful empty search as complete", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ollamaResponse({ role: "assistant", content: "", tool_calls: [searchFoodsCall()] })
      )
      .mockResolvedValueOnce(
        ollamaResponse({ role: "assistant", content: "No matching marketplace foods were found." })
      );
    mockExecuteSearchFoodsTool.mockResolvedValueOnce(toolResult([]));

    const result = await runAiToolCallingConversation("Find a dish with no match");

    expect(result).toEqual({
      answer: "No matching marketplace foods were found.",
      foodRecords: [],
      searchStatus: "complete",
      responseSource: "ollama",
    });
    expect(mockExecuteSearchFoodsTool).toHaveBeenCalledTimes(1);
  });

  test("accumulates multiple successful searches and deduplicates by ID, keeping the first record", async () => {
    const first = foodRecord(1, "Chicken Biryani");
    const second = foodRecord(2, "Chicken Noodles");
    const duplicateWithUpdatedFields = foodRecord("2", "Updated Noodles", "Chef B");
    const third = foodRecord(3, "Biryani Rice");

    fetchMock
      .mockResolvedValueOnce(
        ollamaResponse({
          role: "assistant",
          content: "",
          tool_calls: [searchFoodsCall("chicken")],
        })
      )
      .mockResolvedValueOnce(
        ollamaResponse({
          role: "assistant",
          content: "",
          tool_calls: [searchFoodsCall("biryani")],
        })
      )
      .mockResolvedValueOnce(
        ollamaResponse({ role: "assistant", content: "Here are verified options." })
      );
    mockExecuteSearchFoodsTool
      .mockResolvedValueOnce(toolResult([first, second]))
      .mockResolvedValueOnce(toolResult([duplicateWithUpdatedFields, third]));

    const result = await runAiToolCallingConversation("Search two terms");

    expect(result.foodRecords).toEqual([first, second, third]);
    expect(result.searchStatus).toBe("complete");
    expect(result.responseSource).toBe("ollama");
    expect(mockExecuteSearchFoodsTool).toHaveBeenCalledTimes(2);
  });

  test("returns explicitly incomplete results when a later tool call fails", async () => {
    const verified = foodRecord(5, "Chicken Biryani");
    fetchMock.mockResolvedValueOnce(
      ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [searchFoodsCall("chicken"), searchFoodsCall("rice")],
      })
    );
    mockExecuteSearchFoodsTool
      .mockResolvedValueOnce(toolResult([verified]))
      .mockResolvedValueOnce({
        toolName: "searchFoods",
        success: false,
        content: "Search failed",
        error: "private database details",
      });

    const error = await runAiToolCallingConversation("Find matching foods").catch(
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(AiToolCallingServiceError);
    expect(error).toMatchObject({
      code: "FOOD_SEARCH_FAILED",
      assistantResponse: {
        answer: expect.stringContaining("partial results"),
        foodRecords: [verified],
        searchStatus: "partial",
        responseSource: "fallback",
      },
    });
    expect(
      (error as AiToolCallingServiceError).assistantResponse?.answer
    ).toContain("may not include all matching");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("preserves verified records if Ollama fails while generating the final response", async () => {
    const verified = foodRecord(9, "Verified Chicken Biryani");
    fetchMock
      .mockResolvedValueOnce(
        ollamaResponse({ role: "assistant", content: "", tool_calls: [searchFoodsCall()] })
      )
      .mockRejectedValueOnce(new Error("private Ollama connection detail"));
    mockExecuteSearchFoodsTool.mockResolvedValueOnce(toolResult([verified]));

    await expect(runAiToolCallingConversation("Find food")).rejects.toMatchObject({
      code: "OLLAMA_UNAVAILABLE",
      assistantResponse: {
        answer: expect.stringContaining("couldn't generate a conversational response"),
        foodRecords: [verified],
        searchStatus: "complete",
        responseSource: "fallback",
      },
    });
  });

  test("rejects unknown tool names without executing a tool", async () => {
    fetchMock.mockResolvedValue(
      ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "runSql", arguments: {} } }],
      })
    );

    await expect(runAiToolCallingConversation("Find food")).rejects.toMatchObject({
      code: "UNKNOWN_TOOL",
      assistantResponse: {
        foodRecords: [],
        searchStatus: "unavailable",
        responseSource: "fallback",
      },
    });
    expect(mockExecuteSearchFoodsTool).not.toHaveBeenCalled();
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "tool_call_detected",
      tool: "unknown",
      registered: false,
    }));
  });

  test("rejects malformed Ollama tool arguments before tool execution", async () => {
    fetchMock.mockResolvedValue(
      ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [
          { function: { name: "searchFoods", arguments: ["chicken"] } },
        ],
      })
    );

    await expect(runAiToolCallingConversation("chicken")).rejects.toMatchObject({
      code: "OLLAMA_INVALID_RESPONSE",
      assistantResponse: {
        searchStatus: "unavailable",
        responseSource: "fallback",
      },
    });
    expect(mockExecuteSearchFoodsTool).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("passes malformed limit values only to the registered validator and stops on rejection", async () => {
    const invalidArguments = { foodName: "chicken", limit: 1.5 };
    fetchMock.mockResolvedValue(
      ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: {
              name: "searchFoods",
              arguments: invalidArguments,
            },
          },
        ],
      })
    );
    mockExecuteSearchFoodsTool.mockResolvedValueOnce({
      toolName: "searchFoods",
      success: false,
      content: "limit must be an integer between 1 and 10.",
      error: "limit must be an integer between 1 and 10.",
    });

    await expect(runAiToolCallingConversation("chicken")).rejects.toMatchObject({
      code: "FOOD_SEARCH_FAILED",
      assistantResponse: { responseSource: "fallback" },
    });
    expect(mockExecuteSearchFoodsTool).toHaveBeenCalledWith(invalidArguments);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("preserves the tool-call round limit and records fallback state", async () => {
    const verified = foodRecord(11, "Repeated Search Record");
    fetchMock.mockImplementation(async () =>
      ollamaResponse({ role: "assistant", content: "", tool_calls: [searchFoodsCall()] })
    );
    mockExecuteSearchFoodsTool.mockResolvedValue(toolResult([verified]));

    await expect(runAiToolCallingConversation("Find food")).rejects.toMatchObject({
      code: "TOOL_CALL_LIMIT",
      assistantResponse: {
        foodRecords: [verified],
        searchStatus: "partial",
        responseSource: "fallback",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(mockExecuteSearchFoodsTool).toHaveBeenCalledTimes(3);
  });

  test("returns a safe fallback when the initial Ollama request fails", async () => {
    fetchMock.mockRejectedValue(new Error("private network detail"));

    await expect(runAiToolCallingConversation("Hi")).rejects.toMatchObject({
      code: "OLLAMA_UNAVAILABLE",
      assistantResponse: {
        foodRecords: [],
        searchStatus: "unavailable",
        responseSource: "fallback",
      },
    });
  });

  test("attaches fallback metadata to malformed Ollama responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    } as Response);

    await expect(runAiToolCallingConversation("Hi")).rejects.toMatchObject({
      code: "OLLAMA_INVALID_RESPONSE",
      assistantResponse: {
        foodRecords: [],
        searchStatus: "unavailable",
        responseSource: "fallback",
      },
    });
  });
});
