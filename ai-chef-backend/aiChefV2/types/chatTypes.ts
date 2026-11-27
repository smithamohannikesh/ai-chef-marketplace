import type { FoodSearchRecord } from "./foodTypes";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type SearchStatus = "complete" | "partial" | "unavailable";
export type ResponseSource = "ollama" | "fallback";

/** A message sent to or received from the Ollama chat API. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_name?: string;
  tool_calls?: AssistantToolCall[];
}

/** A tool invocation requested by the assistant. */
export interface AssistantToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/** The user-facing assistant response and any tool calls it requested. */
export interface AssistantResponse {
  answer: string;
  foodRecords: FoodSearchRecord[];
  searchStatus: SearchStatus;
  responseSource: ResponseSource;
  toolCalls?: AssistantToolCall[];
}
