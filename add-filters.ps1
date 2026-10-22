

$ErrorActionPreference = "Stop"

$path = Join-Path $PSScriptRoot "public\index.html"
$backup = Join-Path $PSScriptRoot "backup\index-before-filter-functionality.html"

if (!(Test-Path $path)) { throw "index.html not found." }
if (!(Test-Path $backup)) { throw "Backup not found. Stop." }

$html = [System.IO.File]::ReadAllText($path)

if ($html -match 'function renderFilteredAlerts') {
    Write-Host "Filters already installed." -ForegroundColor Yellow
    exit
}

$marker = '    async function loadAlerts() {'
if (!$html.Contains($marker)) {
    throw "Could not find loadAlerts(). No changes made."
}

$replacement = @'
    let cachedAlerts = [];

    function renderFilteredAlerts() {
      const table = $("alertsTable");
      const query = ($("alertSearch")?.value || "").trim().toLowerCase();
      const severity = $("severityFilter")?.value || "all";
      const status = $("statusFilter")?.value || "all";

      const filtered = cachedAlerts.filter((alert) => {
        const alertStatus = String(alert.status || "active").toLowerCase();
        const alertSeverity = String(alert.severity || "unknown").toLowerCase();
        const searchable = [
          alert.id, alert.type, alert.severity, alert.status, alert.message
        ].map((value) => String(value ?? "")).join(" ").toLowerCase();

        return (!query || searchable.includes(query)) &&
          (severity === "all" || alertSeverity === severity) &&
          (status === "all" || alertStatus === status);
      });

      $("filterCount").textContent =
        `Showing ${filtered.length} of ${cachedAlerts.length} alerts`;

      if (!filtered.length) {
        table.innerHTML = '<tr><td colspan="6" class="empty">No matching alerts.</td></tr>';
        return;
      }

      table.innerHTML = filtered.map((alert) => {
        const id = alert.id;
        const alertStatus = String(alert.status || "active");
        const isResolved = alertStatus.toLowerCase() === "resolved";
        const alertSeverity = String(alert.severity || "unknown").toLowerCase();

        return `
          <tr>
            <td>${escapeHtml(id ?? "-")}</td>
            <td>${escapeHtml(alert.type || "unknown")}</td>
            <td><span class="severity ${escapeHtml(alertSeverity)}">${escapeHtml(alertSeverity)}</span></td>
            <td>${escapeHtml(alertStatus)}</td>
            <td>${escapeHtml(alert.message || "-")}</td>
            <td>
              ${!isResolved && id != null
                ? `<button class="resolve" data-resolve="${escapeHtml(id)}">Resolve</button>`
                : "-"}
            </td>
          </tr>`;
      }).join("");
    }

    $("alertSearch")?.addEventListener("input", renderFilteredAlerts);
    $("severityFilter")?.addEventListener("change", renderFilteredAlerts);
    $("statusFilter")?.addEventListener("change", renderFilteredAlerts);

    async function loadAlerts() {
'@

$html = $html.Replace($marker, $replacement)

$oldBlock = @'
        if (!alerts.length) {
          table.innerHTML = '<tr><td colspan="6" class="empty">No alerts found.</td></tr>';
          return;
        }

        table.innerHTML = alerts.map((alert) => {
          const id = alert.id;
          const status = String(alert.status || "active");
          const isResolved = status.toLowerCase() === "resolved";
          const severity = String(alert.severity || "unknown").toLowerCase();

          return `
            <tr>
              <td>${escapeHtml(id ?? "-")}</td>
              <td>${escapeHtml(alert.type || "unknown")}</td>
              <td><span class="severity ${escapeHtml(severity)}">${escapeHtml(severity)}</span></td>
              <td>${escapeHtml(status)}</td>
              <td>${escapeHtml(alert.message || "-")}</td>
              <td>
                ${!isResolved && id != null
                  ? `<button class="resolve" data-resolve="${escapeHtml(id)}">Resolve</button>`
                  : "-"}
              </td>
            </tr>`;
        }).join("");
'@

$newBlock = @'
        cachedAlerts = alerts;
        renderFilteredAlerts();
'@

if (!$html.Contains($oldBlock)) {
    throw "Could not find the expected alert-rendering block. No file saved."
}

$html = $html.Replace($oldBlock, $newBlock)

[System.IO.File]::WriteAllText($path, $html, [System.Text.UTF8Encoding]::new($false))
Write-Host "Search and filters installed successfully." -ForegroundColor Green
