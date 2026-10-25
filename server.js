const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const net = require("net");

const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const REQUEST_TIMEOUT_MS = 10000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function validateTargetUrl(value) {
  let target;

  try {
    target = new URL(value);
  } catch {
    return { valid: false, error: "Please provide a valid URL." };
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return {
      valid: false,
      error: "Only HTTP and HTTPS URLs are allowed.",
    };
  }

  if (target.username || target.password) {
    return {
      valid: false,
      error: "URLs containing credentials are not allowed.",
    };
  }

  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    hostname === "::" ||
    hostname === "0.0.0.0"
  ) {
    return {
      valid: false,
      error: "Localhost and local network targets are not allowed.",
    };
  }

  if (net.isIP(hostname) === 4 && isPrivateIPv4(hostname)) {
    return {
      valid: false,
      error: "Private or reserved IP addresses are not allowed.",
    };
  }

  if (
    net.isIP(hostname) === 6 &&
    (hostname.includes("::ffff:") ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:"))
  ) {
    return {
      valid: false,
      error: "Private or reserved IP addresses are not allowed.",
    };
  }

  return { valid: true, target };
}

async function explainAnomaly(anomaly) {
  if (!gemini) {
    return {
      ai_configured: false,
      ai_explanation: "Gemini is not configured.",
    };
  }

  try {
    const model = gemini.getGenerativeModel({
      model: "gemini-3.6-flash",
    });

    const prompt = `
You are an API monitoring assistant.
Explain the detected API anomaly in simple, concise English.
Return JSON only with two fields:
"cause": likely explanation based only on the evidence.
"recommended_action": a practical next step.
Do not invent facts.

Anomaly:
${JSON.stringify(anomaly)}
`;

    const result = await model.generateContent(prompt);
    const explanation = result.response.text().trim();

    if (!explanation) {
      throw new Error("Gemini returned an empty explanation.");
    }

    return {
      ai_configured: true,
      ai_explanation: explanation,
    };
  } catch (error) {
    console.error("Gemini error:", error.message);

    return {
      ai_configured: true,
      ai_explanation: "AI explanation is temporarily unavailable.",
      ai_error: error.message,
    };
  }
}

async function saveAlert(anomaly) {
  const alert = {
    ...anomaly,
    status: "active",
    created_at: new Date().toISOString(),
  };

  if (!supabase) {
    return {
      saved: false,
      alert,
      error: "Supabase is not configured.",
    };
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      type: anomaly.type,
      severity: anomaly.severity,
      message: anomaly.message,
      details: anomaly.details || {},
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error.message);

    return {
      saved: false,
      alert,
      error: error.message,
    };
  }

  return { saved: true, alert: data };
}

async function saveMonitoringHistory(record) {
  if (!supabase) {
    console.error("History save failed: Supabase is not configured.");
    return {
      saved: false,
      error: "Supabase is not configured.",
    };
  }

  const { data, error } = await supabase
    .from("monitoring_history")
    .insert({
      url: record.url || "Unknown",
      status_code: record.status_code ?? null,
      response_time_ms: record.response_time_ms ?? null,
      anomalies_detected: record.anomalies_detected ?? 0,
      alerts_saved: record.alerts_saved ?? 0,
      success: Boolean(record.success),
    })
    .select()
    .single();

  if (error) {
    console.error("Monitoring history save error:", error.message);
    return {
      saved: false,
      error: error.message,
    };
  }

  console.log("Monitoring history saved:", data);

  return {
    saved: true,
    record: data,
  };
}
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Care Guide Monitoring API is running",
    timestamp: new Date().toISOString(),
    database_configured: Boolean(supabase),
    gemini_configured: Boolean(gemini),
  });
});

app.get("/test-api", (req, res) => {
  res.json({
    success: true,
    count: 0,
    records: [],
  });
});

app.post("/monitor", async (req, res) => {
  const expectedSecret = process.env.MONITORING_SECRET;
  const providedSecret = req.get("Authorization");

  if (
    !expectedSecret ||
    providedSecret !== `Bearer ${expectedSecret}`
  ) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }
  if (Array.isArray(req.body)) {
    const processBatch = require("./batch-monitor");
    return processBatch(req.body, res, explainAnomaly, saveAlert, saveMonitoringHistory, supabase, gemini);
  }
  const { url, test_mode = false } = req.body || {};

  if (test_mode !== true && (typeof url !== "string" || !url.trim())) {
    return res.status(400).json({
      success: false,
      error: "Please provide a URL in the request body.",
    });
  }

  if (test_mode !== true) {
    const validation = validateTargetUrl(url.trim());

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }
  }

  const targetUrl =
    test_mode === true ? "internal://test-api" : url.trim();

  const startedAt = Date.now();
  const anomalies = [];
  let body = null;
  let responseTime = 0;
  let statusCode = null;
  let contentType = "";

  try {
    if (test_mode === true) {
      body = {
        success: true,
        count: 0,
        records: [],
      };

      responseTime = 1;
      statusCode = 200;
      contentType = "application/json";
    } else {
      const validation = validateTargetUrl(targetUrl);

      const response = await fetch(validation.target, {
        method: "GET",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      });

      responseTime = Date.now() - startedAt;
      statusCode = response.status;
      contentType = response.headers.get("content-type") || "";

      const responseText = await response.text();

      try {
        body = JSON.parse(responseText);
      } catch {
        body = null;

        if (contentType.toLowerCase().includes("application/json")) {
          anomalies.push({
            type: "invalid_json",
            severity: "high",
            message: "The API declared JSON but returned invalid JSON.",
            details: {
              url: targetUrl,
              response_time_ms: responseTime,
            },
          });
        }
      }

      if (!response.ok) {
        anomalies.push({
          type: "http_error",
          severity: response.status >= 500 ? "high" : "medium",
          message: `Monitored API returned HTTP ${response.status}.`,
          details: {
            url: targetUrl,
            status_code: response.status,
          },
        });
      }
    }

    if (responseTime > 3000) {
      anomalies.push({
        type: "slow_response",
        severity: responseTime > 7000 ? "high" : "medium",
        message: `API response took ${responseTime} ms.`,
        details: {
          url: targetUrl,
          response_time_ms: responseTime,
        },
      });
    }

    if (Array.isArray(body)) {
      if (body.length === 0) {
        anomalies.push({
          type: "zero_records",
          severity: "high",
          message: "The API returned an empty array.",
          details: { url: targetUrl, records_count: 0 },
        });
      } else {
        const invalidItems = body.filter(
          (item) => item === null || typeof item !== "object" || Array.isArray(item)
        );

        if (invalidItems.length > 0) {
          anomalies.push({
            type: "invalid_records",
            severity: "medium",
            message: "The API array contains invalid record items.",
            details: {
              url: targetUrl,
              total_records: body.length,
              invalid_records: invalidItems.length,
            },
          });
        }
      }
    } else if (body !== null && typeof body === "object") {
      if (Array.isArray(body.records)) {
        if (body.records.length === 0) {
          anomalies.push({
            type: "zero_records",
            severity: "high",
            message: "The API returned zero records.",
            details: { url: targetUrl, records_count: 0 },
          });
        } else {
          const invalidItems = body.records.filter(
            (item) => item === null || typeof item !== "object" || Array.isArray(item)
          );

          if (invalidItems.length > 0) {
            anomalies.push({
              type: "invalid_records",
              severity: "medium",
              message: "The records array contains invalid items.",
              details: {
                url: targetUrl,
                total_records: body.records.length,
                invalid_records: invalidItems.length,
              },
            });
          }
        }
      } else if (Object.prototype.hasOwnProperty.call(body, "records")) {
        anomalies.push({
          type: "invalid_records",
          severity: "medium",
          message: "The records field is not an array.",
          details: { url: targetUrl },
        });
      } else {
        anomalies.push({
          type: "missing_records",
          severity: "low",
          message: "The API response does not contain a records array.",
          details: { url: targetUrl },
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(body, "count") &&
        (typeof body.count !== "number" ||
          !Number.isFinite(body.count) ||
          body.count < 0)
      ) {
        anomalies.push({
          type: "invalid_count",
          severity: "medium",
          message: "The API returned an invalid count value.",
          details: { url: targetUrl, count: body.count },
        });
      }
    } else if (
      body === null &&
      !anomalies.some((item) => item.type === "invalid_json")
    ) {
      anomalies.push({
        type: "unexpected_data",
        severity: "low",
        message: "The response is not a JSON object or array.",
        details: { url: targetUrl, content_type: contentType },
      });
    }
    const savedAlerts = [];

    for (const anomaly of anomalies) {
      const ai = await explainAnomaly(anomaly);

      const enriched = {
        ...anomaly,
        details: {
          ...anomaly.details,
          ...ai,
          response_time_ms: responseTime,
          ...(test_mode === true ? { test_mode: true } : {}),
        },
      };

      const result = await saveAlert(enriched);

      savedAlerts.push({
        ...result.alert,
        saved: result.saved,
        ...(result.error ? { save_error: result.error } : {}),
      });
    }

    const alertsSavedCount = savedAlerts.filter((item) => item.saved).length;

    await saveMonitoringHistory({
      url: targetUrl,
      status_code: statusCode,
      response_time_ms: responseTime,
      anomalies_detected: anomalies.length,
      alerts_saved: alertsSavedCount,
      success: statusCode !== null && statusCode >= 200 && statusCode < 300,
    });

    return res.json({
      success: true,
      test_mode: test_mode === true,
      url: targetUrl,
      status_code: statusCode,
      response_time_ms: responseTime,
      anomalies_detected: anomalies.length,
      alerts_saved: alertsSavedCount,
      database_connected: Boolean(supabase),
      gemini_configured: Boolean(gemini),
      alerts: savedAlerts,
    });
  } catch (error) {
    responseTime = Date.now() - startedAt;

    const anomaly = {
      type: "request_failed",
      severity: "high",
      message: "The monitored API request failed.",
      details: {
        url: targetUrl,
        response_time_ms: responseTime,
        error: error.message,
      },
    };

    const ai = await explainAnomaly(anomaly);

    const saved = await saveAlert({
      ...anomaly,
      details: {
        ...anomaly.details,
        ...ai,
      },
    });

    await saveMonitoringHistory({
      url: targetUrl,
      status_code: null,
      response_time_ms: responseTime,
      anomalies_detected: 1,
      alerts_saved: saved.saved ? 1 : 0,
      success: false,
    });

    return res.status(502).json({
      success: false,
      url: targetUrl,
      error: error.message,
      response_time_ms: responseTime,
      anomalies_detected: 1,
      alerts_saved: saved.saved ? 1 : 0,
      database_connected: Boolean(supabase),
      gemini_configured: Boolean(gemini),
      alerts: [
        {
          ...saved.alert,
          saved: saved.saved,
          ...(saved.error ? { save_error: saved.error } : {}),
        },
      ],
    });
  }
});

app.get("/monitoring-history", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: "Supabase is not configured.",
    });
  }

  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 100;

  const { data, error } = await supabase
    .from("monitoring_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Supabase monitoring history error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Could not load monitoring history.",
    });
  }

  return res.json({
    success: true,
    count: data.length,
    history: data,
  });
});

app.get("/alerts", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: "Supabase is not configured.",
    });
  }

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase alerts error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  return res.json({
    success: true,
    count: data.length,
    alerts: data,
  });
});

app.get("/alerts/all", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: "Supabase is not configured.",
    });
  }

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase alerts error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  return res.json({
    success: true,
    count: data.length,
    alerts: data,
  });
});

app.patch("/alerts/:id/resolve", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: "Supabase is not configured.",
    });
  }

  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid alert ID.",
    });
  }

  const { data, error } = await supabase
    .from("alerts")
    .update({ status: "resolved" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Supabase resolve error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      error: "Alert not found.",
    });
  }

  return res.json({
    success: true,
    alert: data,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Care Guide server running at http://localhost:${PORT}`);
    console.log("Supabase configured:", Boolean(supabase));
    console.log("Gemini configured:", Boolean(gemini));
  });
}

module.exports = app;

