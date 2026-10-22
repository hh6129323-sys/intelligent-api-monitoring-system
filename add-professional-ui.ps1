
$ErrorActionPreference = "Stop"

$path = Join-Path $PSScriptRoot "public\index.html"
$backup = Join-Path $PSScriptRoot "backup\index-before-professional-ui.html"

if (!(Test-Path $path)) { throw "index.html not found." }
if (!(Test-Path $backup)) { throw "Backup not found. Stop." }

$html = [System.IO.File]::ReadAllText($path)

if ($html.Contains("PROFESSIONAL_UI_V1")) {
    Write-Host "Professional CSS already installed." -ForegroundColor Yellow
    exit
}

$css = @'

    /* PROFESSIONAL_UI_V1 */
    :root {
      --bg: #080d19;
      --panel: #101827;
      --muted: #94a3b8;
      --text: #e8eef8;
      --blue: #60a5fa;
      --red: #fb7185;
      --green: #34d399;
      --yellow: #fbbf24;
      --border: rgba(148, 163, 184, .16);
    }

    body {
      background:
        radial-gradient(ellipse at 10% 0%, rgba(37, 99, 235, .13), transparent 38%),
        var(--bg);
      color: var(--text);
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      line-height: 1.55;
    }

    aside {
      background: rgba(12, 19, 33, .96);
      border-right: 1px solid var(--border);
    }

    .brand {
      font-size: 25px;
      font-weight: 800;
      letter-spacing: -.7px;
    }

    .brand span { color: var(--blue); }

    .side-subtitle {
      letter-spacing: 1.7px;
      font-size: 10px;
      color: var(--muted);
    }

    .nav-item {
      border-radius: 10px;
      padding: 11px 13px;
      margin: 5px 0;
      transition: background .2s ease, color .2s ease;
    }

    .nav-item.active {
      background: rgba(59, 130, 246, .15);
      color: #93c5fd;
      border: 1px solid rgba(96, 165, 250, .2);
    }

    .topbar {
      margin-bottom: 26px;
    }

    .cards {
      gap: 16px;
    }

    .card, .panel {
      background: linear-gradient(145deg, rgba(19, 29, 47, .98), rgba(13, 21, 36, .98));
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 12px 35px rgba(0, 0, 0, .15);
    }

    .card {
      padding: 22px;
      transition: transform .2s ease, border-color .2s ease;
    }

    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(96, 165, 250, .4);
    }

    .card-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .4px;
    }

    .card-value {
      font-size: 30px;
      font-weight: 750;
      margin-top: 8px;
    }

    .panel {
      padding: 24px;
      margin-top: 20px;
    }

    input, select, textarea {
      background: #0b1322;
      color: var(--text);
      border: 1px solid #2a3950;
      border-radius: 9px;
      padding: 11px 13px;
      outline: none;
      max-width: 100%;
    }

    input:focus, select:focus, textarea:focus {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(96, 165, 250, .12);
    }

    button {
      border: 1px solid rgba(96, 165, 250, .3);
      border-radius: 9px;
      padding: 10px 15px;
      background: #2563eb;
      color: white;
      font-weight: 650;
      cursor: pointer;
      transition: filter .2s ease, transform .2s ease;
    }

    button:hover {
      filter: brightness(1.13);
      transform: translateY(-1px);
    }

    button:focus-visible {
      outline: 2px solid #93c5fd;
      outline-offset: 3px;
    }

    button.resolve {
      background: rgba(16, 185, 129, .12);
      color: #6ee7b7;
      border-color: rgba(52, 211, 153, .3);
    }

    table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
    }

    th {
      background: #111c2e;
      color: #a9bad0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .8px;
    }

    th, td {
      border-bottom: 1px solid var(--border);
      padding: 14px 12px;
      text-align: left;
    }

    tbody tr {
      transition: background .15s ease;
    }

    tbody tr:hover {
      background: rgba(96, 165, 250, .055);
    }

    .severity {
      border: 1px solid rgba(251, 191, 36, .2);
      border-radius: 999px;
      padding: 4px 9px;
      font-weight: 700;
      letter-spacing: .2px;
    }

    .severity.high {
      color: #fda4af;
      background: rgba(244, 63, 94, .1);
      border-color: rgba(244, 63, 94, .25);
    }

    .severity.medium {
      color: #fcd34d;
      background: rgba(245, 158, 11, .1);
    }

    .severity.low {
      color: #93c5fd;
      background: rgba(59, 130, 246, .1);
      border-color: rgba(59, 130, 246, .25);
    }

    .empty {
      padding: 32px;
      color: var(--muted);
    }

    @media (max-width: 650px) {
      .cards { grid-template-columns: 1fr 1fr; }
      .card { padding: 15px; }
      .card-value { font-size: 24px; }
      .panel { padding: 14px; overflow-x: auto; }
      input, select { width: 100%; box-sizing: border-box; }
      .topbar { gap: 12px; flex-wrap: wrap; }
      th, td { padding: 10px 8px; }
    }
'@

$marker = "  </style>"
if (!$html.Contains($marker)) { throw "CSS closing tag not found. No changes made." }

$html = $html.Replace($marker, $css + "`r`n  </style>")
[System.IO.File]::WriteAllText($path, $html, [System.Text.UTF8Encoding]::new($false))

Write-Host "Professional CSS installed." -ForegroundColor Green
