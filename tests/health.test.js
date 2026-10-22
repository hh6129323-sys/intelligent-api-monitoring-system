
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              cause: "Test anomaly detected.",
              recommended_action: "Check the API response.",
            }),
        },
      }),
    })),
  })),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn((record) => ({
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 1,
              ...record,
            },
            error: null,
          }),
        })),
      })),
    })),
  })),
}));

const request = require("supertest");
const app = require("../server");

describe("Care Guide Monitoring API", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET /health should return success", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty("database_configured");
    expect(response.body).toHaveProperty("gemini_configured");
  });

  test("POST /monitor should reject a missing URL", async () => {
    const response = await request(app)
      .post("/monitor")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/provide a URL/i);
  });

  test("POST /monitor should reject an invalid URL", async () => {
    const response = await request(app)
      .post("/monitor")
      .send({ url: "not-a-valid-url" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test("POST /monitor test mode should detect zero records", async () => {
    const response = await request(app)
      .post("/monitor")
      .send({ test_mode: true });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.test_mode).toBe(true);
    expect(response.body.anomalies_detected).toBeGreaterThan(0);

    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "zero_records",
        }),
      ])
    );
  });

  test("should detect missing records", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ message: "Hello" }),
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "missing_records" }),
      ])
    );
  });

  test("should detect invalid records", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ records: "not-an-array" }),
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "invalid_records" }),
      ])
    );
  });

  test("should detect invalid count", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          records: [{ id: 1 }],
          count: -1,
        }),
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "invalid_count" }),
      ])
    );
  });

  test("should detect HTTP errors", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          records: [{ id: 1 }],
          count: 1,
        }),
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "http_error" }),
      ])
    );
  });

  test("should detect invalid JSON", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => "this is not valid JSON",
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "invalid_json" }),
      ])
    );
  });

  test("should detect unexpected non-JSON data", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/plain" },
      text: async () => "plain text response",
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "unexpected_data" }),
      ])
    );
  });
});

  test("should detect a slow response", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      const start = Date.now();

      while (Date.now() - start < 3100) {
        // Simulate a slow API response.
      }

      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify({
            records: [{ id: 1 }],
            count: 1,
          }),
      };
    });

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(200);
    expect(response.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "slow_response" }),
      ])
    );
  });

  test("should handle a failed API request", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(
      new Error("Simulated network failure")
    );

    const response = await request(app)
      .post("/monitor")
      .send({ url: "https://example.com/api" });

    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
    expect(response.body.anomalies_detected).toBe(1);
  });

