import { Request, Response } from "express";
import {
  createAiChefV2RequestId,
  logAiChefV2Event,
  withAiChefV2RequestContext,
} from "../diagnosticLogger";
import {
  AiToolCallingServiceError,
  runAiToolCallingConversation,
} from "../services/aiToolCallingService";

const MAX_MESSAGE_LENGTH = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respond(
  res: Response,
  status: number,
  body: unknown,
  outcome: "success" | "fallback" | "error",
  startedAt: number,
  details: Record<string, unknown> = {}
): void {
  const responseFields = {
    httpStatus: status,
    outcome,
    durationMs: Date.now() - startedAt,
    ...details,
  };
  logAiChefV2Event("api_response", responseFields);
  logAiChefV2Event("request_completed", responseFields);
  res.status(status).json(body);
}

export async function postChat(req: Request, res: Response): Promise<void> {
  const requestId = createAiChefV2RequestId(req.get("x-request-id"));
  const startedAt = Date.now();

  return withAiChefV2RequestContext(requestId, async () => {
    const body: unknown = req.body;
    const messageLength = isRecord(body) && typeof body.message === "string"
      ? body.message.length
      : undefined;
    logAiChefV2Event("request_received", {
      messageLength: messageLength ?? null,
    });

    if (!isRecord(body)) {
      logAiChefV2Event("request_validation_failed", {
        stage: "controller_validation",
        errorCode: "INVALID_BODY",
        handled: true,
      });
      respond(res, 400, { message: "Request body must be a JSON object" }, "error", startedAt);
      return;
    }

    const unsupportedFields = Object.keys(body).filter((key) => key !== "message");
    if (unsupportedFields.length > 0) {
      logAiChefV2Event("request_validation_failed", {
        stage: "controller_validation",
        errorCode: "UNSUPPORTED_FIELDS",
        handled: true,
      });
      respond(res, 400, { message: "Only the message field is supported" }, "error", startedAt);
      return;
    }

    const { message } = body;
    if (typeof message !== "string" || !message.trim()) {
      logAiChefV2Event("request_validation_failed", {
        stage: "controller_validation",
        errorCode: "INVALID_MESSAGE",
        handled: true,
      });
      respond(res, 400, { message: "A non-empty message is required" }, "error", startedAt);
      return;
    }

    const cleanMessage = message.trim();
    if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
      logAiChefV2Event("request_validation_failed", {
        stage: "controller_validation",
        errorCode: "MESSAGE_TOO_LONG",
        handled: true,
      });
      respond(
        res,
        400,
        { message: `Message must not exceed ${MAX_MESSAGE_LENGTH} characters` },
        "error",
        startedAt
      );
      return;
    }

    logAiChefV2Event("controller_validation_passed", {
      messageLength: cleanMessage.length,
    });

    try {
      const answer = await runAiToolCallingConversation(cleanMessage);
      respond(res, 200, answer, "success", startedAt, {
        responseSource: answer.responseSource,
        searchStatus: answer.searchStatus,
      });
    } catch (error) {
      if (error instanceof AiToolCallingServiceError) {
        logAiChefV2Event("error_handled", {
          stage: "ai_tool_calling",
          errorName: error.name,
          errorCode: error.code,
          handled: true,
          fallbackReturned: Boolean(error.assistantResponse),
        });

        if (error.code === "INVALID_MESSAGE") {
          respond(res, 400, { message: "Message is invalid" }, "error", startedAt, {
            errorCode: error.code,
          });
          return;
        }

        if (error.assistantResponse) {
          respond(res, 502, error.assistantResponse, "fallback", startedAt, {
            errorCode: error.code,
            responseSource: error.assistantResponse.responseSource,
            searchStatus: error.assistantResponse.searchStatus,
          });
          return;
        }

        respond(
          res,
          502,
          { message: "The AI service could not complete the request" },
          "error",
          startedAt,
          { errorCode: error.code }
        );
        return;
      }

      logAiChefV2Event("error_handled", {
        stage: "controller",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: "UNEXPECTED_ERROR",
        handled: true,
        fallbackReturned: false,
      });
      respond(
        res,
        500,
        { message: "AI Chef V2 could not complete the request" },
        "error",
        startedAt,
        { errorCode: "UNEXPECTED_ERROR" }
      );
    }
  });
}
