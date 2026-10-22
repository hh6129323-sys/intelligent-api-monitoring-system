# Intelligent API Monitoring & Alert System

## Overview
A Node.js and Express application that monitors API responses, detects anomalies, generates AI-assisted explanations using Google Gemini, and stores alerts and monitoring history in Supabase.

## Features
- API health endpoint
- API response-time monitoring
- HTTP error detection
- Detection of missing, invalid, or empty records
- AI-assisted anomaly explanations using Gemini
- Alert storage and monitoring history using Supabase
- Dashboard for viewing alerts and monitoring statistics
- Automated tests using Jest and Supertest

## Requirements
- Node.js and npm
- Supabase project and database configuration
- Google Gemini API key

## Setup
1. Clone or download this repository.
2. Open a terminal in the project directory.
3. Install dependencies:

   npm install

4. Create a `.env` file in the project root with these variables:

   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   GEMINI_API_KEY=your_gemini_api_key

Never commit real API keys or the `.env` file to GitHub.

## Run
Start the application:

   npm start

Open the dashboard at:

   http://localhost:3000

## API Endpoints
- `GET /health` — Check application health and configuration status.
- `POST /monitor` — Monitor a target API URL. The request body accepts a `url`; test mode is also supported.
- `GET /alerts` — Retrieve active alerts.
- `GET /alerts/all` — Retrieve all alerts.
- `PATCH /alerts/:id/resolve` — Resolve an alert.
- `GET /monitoring-history` — Retrieve monitoring history.
- `GET /test-api` — Test API endpoint.

## Run Tests
Execute the automated test suite:

   npm test

## AI Prompt Documentation
See `AI_Prompts.docx` for the Gemini prompt used to explain detected anomalies.

## Project Structure
- `server.js` — Express server, monitoring logic, AI integration, and API routes.
- `public/index.html` — Monitoring dashboard.
- `tests/health.test.js` — Automated API tests.
- `AI_Prompts.docx` — AI prompt documentation.
- `.env` — Local credentials; do not commit.
