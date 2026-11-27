/** Arguments supplied by an AI tool call after backend validation. */
export interface ToolArguments {
  [key: string]: unknown;
}

/** JSON Schema shape used to describe a tool's input to Ollama. */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
    }
  >;
  required?: string[];
}

/** Ollama-compatible definition of a callable backend tool. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

/** Result produced by a backend tool and returned to the chat flow. */
export interface ToolExecutionResult<TStructuredData = unknown> {
  toolName: string;
  success: boolean;
  content: string;
  error?: string;
  structuredData?: TStructuredData;
}
