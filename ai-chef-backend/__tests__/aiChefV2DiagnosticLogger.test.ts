import {
  logAiChefV2Event,
  redactDiagnosticValue,
  withAiChefV2RequestContext,
} from "../aiChefV2/diagnosticLogger";

describe("AI Chef V2 diagnostic logger", () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("adds a request ID and timestamp to each structured event", () => {
    withAiChefV2RequestContext("request-test-123", () => {
      logAiChefV2Event("diagnostic_test", { success: true });
    });

    const entry = JSON.parse(String(infoSpy.mock.calls[0][0]));
    expect(entry).toMatchObject({
      component: "ai-chef-v2",
      event: "diagnostic_test",
      requestId: "request-test-123",
      success: true,
    });
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
  });

  test("redacts credentials and common personal contact details in diagnostics", () => {
    const redacted = redactDiagnosticValue({
      prompt: "Contact person@example.com or +1 555 123 4567; Bearer abc.def.ghi",
      apiKey: "super-secret",
      password: "db-password",
    });

    expect(JSON.stringify(redacted)).not.toContain("person@example.com");
    expect(JSON.stringify(redacted)).not.toContain("+1 555 123 4567");
    expect(JSON.stringify(redacted)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(redacted)).not.toContain("super-secret");
    expect(JSON.stringify(redacted)).not.toContain("db-password");
  });
});
