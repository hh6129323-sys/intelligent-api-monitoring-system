async function processBatch(items, res, explainAnomaly, saveAlert, saveMonitoringHistory, supabase, gemini) {
  if (items.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Provide at least one API result.",
    });
  }

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (
      !item ||
      typeof item.api_name !== "string" ||
      !item.api_name.trim() ||
      typeof item.response_time_ms !== "number" ||
      !Number.isFinite(item.response_time_ms) ||
      item.response_time_ms < 0 ||
      !Number.isInteger(item.status_code) ||
      item.status_code < 100 ||
      item.status_code > 599 ||
      typeof item.records_returned !== "number" ||
      !Number.isFinite(item.records_returned) ||
      item.records_returned < 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Each item requires api_name, response_time_ms, status_code, and records_returned with valid values.",
        item_index: i,
      });
    }

    const name = item.api_name.trim();
    const anomalies = [];

    if (item.response_time_ms > 3000) {
      anomalies.push({
        type: "slow_response",
        severity: item.response_time_ms > 7000 ? "high" : "medium",
        message: `API response took ${item.response_time_ms} ms.`,
        details: { api_name: name, response_time_ms: item.response_time_ms },
      });
    }

    if (item.status_code < 200 || item.status_code >= 300) {
      anomalies.push({
        type: "http_error",
        severity: item.status_code >= 500 ? "high" : "medium",
        message: `Monitored API returned HTTP ${item.status_code}.`,
        details: { api_name: name, status_code: item.status_code },
      });
    }

    if (item.records_returned === 0) {
      anomalies.push({
        type: "zero_records",
        severity: "high",
        message: "The API returned zero records.",
        details: { api_name: name, records_returned: 0 },
      });
    }

    const alerts = [];

    for (const anomaly of anomalies) {
      const ai = await explainAnomaly(anomaly);
      const saved = await saveAlert({
        ...anomaly,
        details: {
          ...anomaly.details,
          ...ai,
          response_time_ms: item.response_time_ms,
          status_code: item.status_code,
        },
      });

      alerts.push({
        ...saved.alert,
        saved: saved.saved,
        ...(saved.error ? { save_error: saved.error } : {}),
      });
    }

    const alertsSaved = alerts.filter((alert) => alert.saved).length;

    await saveMonitoringHistory({
      url: name,
      status_code: item.status_code,
      response_time_ms: item.response_time_ms,
      anomalies_detected: anomalies.length,
      alerts_saved: alertsSaved,
      success: item.status_code >= 200 && item.status_code < 300,
    });

    results.push({
      api_name: name,
      response_time_ms: item.response_time_ms,
      status_code: item.status_code,
      records_returned: item.records_returned,
      anomalies_detected: anomalies.length,
      alerts_saved: alertsSaved,
      alerts,
    });
  }

  return res.json({
    success: true,
    batch_mode: true,
    total_apis: results.length,
    total_anomalies: results.reduce((sum, item) => sum + item.anomalies_detected, 0),
    total_alerts_saved: results.reduce((sum, item) => sum + item.alerts_saved, 0),
    database_connected: Boolean(supabase),
    gemini_configured: Boolean(gemini),
    results,
  });
}

module.exports = processBatch;
