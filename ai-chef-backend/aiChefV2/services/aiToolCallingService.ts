import { config } from "../../config";
import {
  createAiChefV2RequestId,
  getAiChefV2RequestId,
  isAiChefV2Development,
  logAiChefV2Event,
  redactDiagnosticValue,
  withAiChefV2RequestContext,
} from "../diagnosticLogger";
import { executeSearchFoodsTool, searchFoodsTool } from "../tools/foodSearchTool";
import {
  AssistantResponse,
  AssistantToolCall,
  ChatMessage,
  SearchStatus,
} from "../types/chatTypes";
import type { FoodSearchRecord } from "../types/foodTypes";
import { ToolExecutionResult } from "../types/toolTypes";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_TOOL_CALL_ROUNDS = 3;
const MAX_USER_MESSAGE_LENGTH = 5_000;
const SYSTEM_INSTRUCTION = [
  "You are the AI Chef Marketplace assistant.",
  "Use searchFoods results as the only source for marketplace food facts.",
  "Never invent or infer food names, prices, ingredients, chef details, descriptions, or availability.",
  "If a successful search returns no food records, clearly say that no matching records were found.",
  "If a search fails, clearly say the search could not be completed and do not claim any results.",
  "For any message that names a food or asks to find, search, recommend, compare, or check marketplace food availability, call searchFoods before answering.",
  "Pass the food name or requested food keywords as foodName. Omit limit; the backend uses a safe default of 10.",
  "Keep marketplace facts grounded in the records returned by the tool.",
].join(" ");

export type AiToolCallingErrorCode =
  | "INVALID_MESSAGE"
  | "OLLAMA_UNAVAILABLE"
  | "OLLAMA_INVALID_RESPONSE"
  | "UNKNOWN_TOOL"
  | "TOOL_CALL_LIMIT"
  | "FOOD_SEARCH_FAILED";

export class AiToolCallingServiceError extends Error {
  constructor(
    message: string,
    readonly code: AiToolCallingErrorCode,
    readonly assistantResponse?: AssistantResponse
  ) {
    super(message);
    this.name = "AiToolCallingServiceError";
  }
}

interface OllamaChatMessage {
  content: string;
  tool_calls?: AssistantToolCall[];
}

const availableTools = [searchFoodsTool];
const toolExecutors: Record<
  string,
  (input: unknown) => Promise<ToolExecutionResult<unknown>>
> = {
  [searchFoodsTool.function.name]: executeSearchFoodsTool,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFoodSearchRecord(value: unknown): value is FoodSearchRecord {
  return (
    isRecord(value) &&
    (typeof value.id === "number" || typeof value.id === "string") &&
    typeof value.chef_id === "string" &&
    typeof value.chef_name === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (typeof value.price === "number" || typeof value.price === "string") &&
    typeof value.image_key === "string" &&
    Array.isArray(value.ingredients) &&
    value.ingredients.every((ingredient) => typeof ingredient === "string") &&
    typeof value.is_available === "boolean"
  );
}

function parseToolCalls(value: unknown): AssistantToolCall[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AiToolCallingServiceError(
      "The AI service returned an invalid response.",
      "OLLAMA_INVALID_RESPONSE"
    );
  }

  return value.map((call): AssistantToolCall => {
    if (
      !isRecord(call) ||
      !isRecord(call.function) ||
      typeof call.function.name !== "string" ||
      !call.function.name.trim() ||
      !isRecord(call.function.arguments)
    ) {
      throw new AiToolCallingServiceError(
        "The AI service returned an invalid tool call.",
        "OLLAMA_INVALID_RESPONSE"
      );
    }

    return {
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    };
  });
}

function parseAssistantMessage(value: unknown): OllamaChatMessage {
  if (!isRecord(value) || !isRecord(value.message)) {
    throw new AiToolCallingServiceError(
      "The AI service returned an invalid response.",
      "OLLAMA_INVALID_RESPONSE"
    );
  }

  const { content, tool_calls: rawToolCalls } = value.message;
  if (typeof content !== "string") {
    throw new AiToolCallingServiceError(
      "The AI service returned an invalid response.",
      "OLLAMA_INVALID_RESPONSE"
    );
  }

  const toolCalls = parseToolCalls(rawToolCalls);
  return {
    content,
    ...(rawToolCalls === undefined ? {} : { tool_calls: toolCalls }),
  };
}

function isToolCallLookingJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  return /"tool_calls"\s*:|"function"\s*:|"arguments"\s*:/i.test(trimmed);
}

function developmentPromptDiagnostic(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: message.role,
        tool_name: message.tool_name,
        contentLength: message.content.length,
        content: "[REDACTED_TOOL_RESULT]",
      };
    }
    return redactDiagnosticValue(message);
  });
}

async function requestOllama(
  messages: ChatMessage[],
  round: number
): Promise<OllamaChatMessage> {
  const startedAt = Date.now();
  logAiChefV2Event("ollama_request_started", {
    model: config.ollamaModel,
    round,
    messageCount: messages.length,
    ...(isAiChefV2Development()
      ? { diagnosticPrompt: developmentPromptDiagnostic(messages) }
      : {}),
  });

  let response: Response;
  try {
    response = await fetch(
      `${config.ollamaUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          tools: availableTools,
          options: { temperature: 0 },
          stream: false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
  } catch (error) {
    logAiChefV2Event("ollama_request_completed", {
      model: config.ollamaModel,
      round,
      httpStatus: null,
      success: false,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: "OLLAMA_UNAVAILABLE",
    });
    throw new AiToolCallingServiceError(
      "The AI service is unavailable or timed out.",
      "OLLAMA_UNAVAILABLE"
    );
  }

  logAiChefV2Event("ollama_request_completed", {
    model: config.ollamaModel,
    round,
    httpStatus: response.status,
    success: response.ok,
    response:response,
    durationMs: Date.now() - startedAt,
    ...(!response.ok ? { errorCode: "OLLAMA_UNAVAILABLE" } : {}),
  });

  if (!response.ok) {
    throw new AiToolCallingServiceError(
      "The AI service could not complete the request.",
      "OLLAMA_UNAVAILABLE"
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    logAiChefV2Event("ollama_response_invalid", {
      stage: "response_json_parsing",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: "OLLAMA_INVALID_RESPONSE",
    });
    throw new AiToolCallingServiceError(
      "The AI service returned an invalid response.",
      "OLLAMA_INVALID_RESPONSE"
    );
  }

  const rawPayload = isRecord(payload) ? payload : {};
  const rawMessage = isRecord(rawPayload.message) ? rawPayload.message : {};
  const rawContent = rawMessage.content;
  const rawToolCalls = rawMessage.tool_calls;
  const finishReason = rawPayload.done_reason ?? rawPayload.finish_reason;
  logAiChefV2Event("ollama_response_received", {
    round,
    topLevelKeys: Object.keys(rawPayload),
    messageKeys: Object.keys(rawMessage),
    messageRole: typeof rawMessage.role === "string" ? rawMessage.role : null,
    toolCallsPresent: rawToolCalls !== undefined,
    toolCallCount: Array.isArray(rawToolCalls) ? rawToolCalls.length : null,
    ordinaryTextContent:
      typeof rawContent === "string" && rawContent.trim().length > 0,
    contentLength: typeof rawContent === "string" ? rawContent.length : null,
    finishReason: typeof finishReason === "string" ? finishReason : null,
    ...(isAiChefV2Development()
      ? { diagnosticRawResponse: redactDiagnosticValue(payload) }
      : {}),
  });

  try {
    return parseAssistantMessage(payload);
  } catch (error) {
    logAiChefV2Event("ollama_response_invalid", {
      stage: "response_validation",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        error instanceof AiToolCallingServiceError
          ? error.code
          : "OLLAMA_INVALID_RESPONSE",
    });
    throw error;
  }
}

function safeToolFailure(toolName: string): ToolExecutionResult<unknown> {
  return {
    toolName,
    success: false,
    content: "The requested tool could not be completed.",
    error: "The requested tool could not be completed.",
  };
}

function getSearchStatus(
  successfulSearches: number,
  failedSearches: number
): SearchStatus {
  if (successfulSearches === 0) return "unavailable";
  return failedSearches > 0 ? "partial" : "complete";
}

function fallbackResponse(
  successfulSearches: number,
  failedSearches: number,
  foodRecords: FoodSearchRecord[]
): AssistantResponse {
  const searchStatus = getSearchStatus(successfulSearches, failedSearches);
  let answer: string;

  if (searchStatus === "partial") {
    answer =
      "Some searches completed, but another search failed. These are partial results and may not include all matching marketplace foods.";
  } else if (searchStatus === "complete" && foodRecords.length === 0) {
    answer =
      "The search completed with no matching food records, but I couldn't generate a conversational response.";
  } else if (searchStatus === "complete") {
    answer =
      "I retrieved verified marketplace records, but couldn't generate a conversational response. See the verified records below.";
  } else {
    answer =
      "I couldn't complete a marketplace search, so I can't confirm matching food records.";
  }

  return {
    answer,
    foodRecords,
    searchStatus,
    responseSource: "fallback",
  };
}

function attachFallback(
  error: AiToolCallingServiceError,
  successfulSearches: number,
  failedSearches: number,
  foodRecords: FoodSearchRecord[]
): AiToolCallingServiceError {
  return new AiToolCallingServiceError(
    error.message,
    error.code,
    fallbackResponse(successfulSearches, failedSearches, foodRecords)
  );
}

function collectFoodRecords(
  target: Map<string, FoodSearchRecord>,
  value: unknown
): boolean {
  if (!Array.isArray(value) || !value.every(isFoodSearchRecord)) return false;

  for (const record of value) {
    const id = String(record.id);
    if (!target.has(id)) target.set(id, record);
  }
  return true;
}

/** Runs a user message through Ollama and executes only registered V2 tools. */
async function runAiToolCallingConversationInContext(
  userMessage: string
): Promise<AssistantResponse> {
  if (
    typeof userMessage !== "string" ||
    !userMessage.trim() ||
    userMessage.trim().length > MAX_USER_MESSAGE_LENGTH
  ) {
    logAiChefV2Event("request_validation_failed", {
      stage: "service_validation",
      errorCode: "INVALID_MESSAGE",
      handled: true,
    });
    throw new AiToolCallingServiceError(
      `Message must contain 1 to ${MAX_USER_MESSAGE_LENGTH} characters.`,
      "INVALID_MESSAGE"
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    { role: "user", content: userMessage.trim() },
  ];
  const foodRecordsById = new Map<string, FoodSearchRecord>();
  let successfulSearches = 0;
  let failedSearches = 0;
  let toolCallRounds = 0;

  while (true) {
    const ollamaStartedAt = Date.now();
    let assistantMessage: OllamaChatMessage;
    try {
      assistantMessage = await requestOllama(messages, toolCallRounds + 1);
    } catch (error) {
      if (error instanceof AiToolCallingServiceError) {
        logAiChefV2Event("error_handled", {
          stage: "ollama_request",
          errorName: error.name,
          errorCode: error.code,
          handled: true,
          fallbackReturned: true,
        });
        throw attachFallback(
          error,
          successfulSearches,
          failedSearches,
          [...foodRecordsById.values()]
        );
      }
      logAiChefV2Event("error_handled", {
        stage: "ollama_request",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: "OLLAMA_INVALID_RESPONSE",
        handled: true,
        fallbackReturned: true,
      });
      throw new AiToolCallingServiceError(
        "The AI service could not complete the request.",
        "OLLAMA_INVALID_RESPONSE",
        fallbackResponse(
          successfulSearches,
          failedSearches,
          [...foodRecordsById.values()]
        )
      );
    }

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      logAiChefV2Event("final_response_received", {
        responseSource: "ollama",
        durationMs: Date.now() - ollamaStartedAt,
        hasOrdinaryText: assistantMessage.content.trim().length > 0,
        responseLength: assistantMessage.content.length,
        suspiciousToolCallJson: isToolCallLookingJson(assistantMessage.content),
        ...(isAiChefV2Development()
          ? {
              diagnosticFinalResponse: redactDiagnosticValue(
                assistantMessage.content
              ),
            }
          : {}),
      });
      return {
        answer: assistantMessage.content,
        foodRecords: [...foodRecordsById.values()],
        searchStatus: getSearchStatus(successfulSearches, failedSearches),
        responseSource: "ollama",
      };
    }

    if (toolCallRounds >= MAX_TOOL_CALL_ROUNDS) {
      failedSearches += 1;
      logAiChefV2Event("error_handled", {
        stage: "tool_call_processing",
        errorName: "AiToolCallingServiceError",
        errorCode: "TOOL_CALL_LIMIT",
        handled: true,
        fallbackReturned: true,
      });
      throw attachFallback(
        new AiToolCallingServiceError(
          "The AI service exceeded the tool-call limit.",
          "TOOL_CALL_LIMIT"
        ),
        successfulSearches,
        failedSearches,
        [...foodRecordsById.values()]
      );
    }
    toolCallRounds += 1;

    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const executeTool = Object.prototype.hasOwnProperty.call(
        toolExecutors,
        toolName
      )
        ? toolExecutors[toolName]
        : undefined;
      logAiChefV2Event("tool_call_detected", {
        tool: executeTool ? toolName : "unknown",
        registered: Boolean(executeTool),
        round: toolCallRounds,
        ...(executeTool && isAiChefV2Development()
          ? { diagnosticArguments: redactDiagnosticValue(toolCall.function.arguments) }
          : {}),
      });
      if (!executeTool) {
        failedSearches += 1;
        logAiChefV2Event("error_handled", {
          stage: "tool_call_processing",
          errorName: "AiToolCallingServiceError",
          errorCode: "UNKNOWN_TOOL",
          handled: true,
          fallbackReturned: true,
        });
        throw attachFallback(
          new AiToolCallingServiceError(
            "The AI service requested an unsupported tool.",
            "UNKNOWN_TOOL"
          ),
          successfulSearches,
          failedSearches,
          [...foodRecordsById.values()]
        );
      }

      let result: ToolExecutionResult<unknown>;
      try {
        result = await executeTool(toolCall.function.arguments);
      } catch (error) {
        logAiChefV2Event("tool_execution_failed", {
          tool: "searchFoods",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: "TOOL_EXECUTION_THROWN",
        });
        result = safeToolFailure(toolName);
      }

      logAiChefV2Event("tool_execution_result_received", {
        tool: "searchFoods",
        success: result.success,
        resultCount: Array.isArray(result.structuredData)
          ? result.structuredData.length
          : null,
      });

      if (!result.success) {
        failedSearches += 1;
        logAiChefV2Event("tool_result_returned", {
          tool: "searchFoods",
          success: false,
          resultCount: 0,
          addedToConversation: false,
        });
        logAiChefV2Event("error_handled", {
          stage: "tool_call_processing",
          errorName: "AiToolCallingServiceError",
          errorCode: "FOOD_SEARCH_FAILED",
          handled: true,
          fallbackReturned: true,
        });
        throw attachFallback(
          new AiToolCallingServiceError(
            "The food search could not be completed.",
            "FOOD_SEARCH_FAILED"
          ),
          successfulSearches,
          failedSearches,
          [...foodRecordsById.values()]
        );
      }

      if (
        toolName === searchFoodsTool.function.name &&
        !collectFoodRecords(foodRecordsById, result.structuredData)
      ) {
        failedSearches += 1;
        logAiChefV2Event("tool_result_returned", {
          tool: "searchFoods",
          success: false,
          resultCount: 0,
          addedToConversation: false,
          errorCode: "FOOD_SEARCH_FAILED",
        });
        logAiChefV2Event("error_handled", {
          stage: "tool_result_validation",
          errorName: "AiToolCallingServiceError",
          errorCode: "FOOD_SEARCH_FAILED",
          handled: true,
          fallbackReturned: true,
        });
        throw attachFallback(
          new AiToolCallingServiceError(
            "The food search returned invalid structured data.",
            "FOOD_SEARCH_FAILED"
          ),
          successfulSearches,
          failedSearches,
          [...foodRecordsById.values()]
        );
      }

      if (toolName === searchFoodsTool.function.name) successfulSearches += 1;

      messages.push({
        role: "tool",
        tool_name: result.toolName,
        content: result.content,
      });
      logAiChefV2Event("tool_result_returned", {
        tool: "searchFoods",
        success: true,
        resultCount: Array.isArray(result.structuredData)
          ? result.structuredData.length
          : 0,
        addedToConversation: true,
      });
    }
  }
}

/** Runs a user message through Ollama and executes only registered V2 tools. */
export async function runAiToolCallingConversation(
  userMessage: string
): Promise<AssistantResponse> {
  const requestId = getAiChefV2RequestId() ?? createAiChefV2RequestId();
  return withAiChefV2RequestContext(requestId, () =>
    runAiToolCallingConversationInContext(userMessage)
  );
}
