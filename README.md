# TokenLens

Chrome Extension to track real-time token usage, efficiency, and quota across Claude, ChatGPT, and Gemini. Built for users who want to understand how they consume tokens, optimise their prompts, and stay within usage limits — with or without an API key.

## Features

- **Token Gauge**: Live arc gauge showing 5-hour quota usage at a glance, with colour shifts at 75% (amber) and 90% (red)
- **Input / Output Breakdown**: Separate token counts for your messages and AI responses
- **Prompt Efficiency Score**: Rates your prompts from 0–100 based on meaningful vs. filler word ratio
- **Filler Word Detection**: Identifies and surfaces AI filler words that inflate your token count
- **Top Words**: Word frequency grid to spot token-heavy terms in your prompts
- **Redundancy Detection**: Flags repeated phrases across messages with severity ratings
- **Rolling Quota Tracking**: 5-hour and weekly usage windows — no API key needed
- **Multi-platform Support**: Works across Claude, ChatGPT, and Gemini simultaneously
- **Three Data Source Tiers**: API (exact) → Network interception (exact) → DOM estimation (fallback)
- **Usage Limit Warnings**: Detects Claude's native limit messages and shows countdown to reset
- **API Cost Estimate**: Shown only when an API key is connected and counts are exact

## Architecture

### Chrome Extension Components

| File | Role |
|---|---|
| `manifest.json` | Extension configuration, permissions, content script registration |
| `src/background/service-worker.js` | Background worker for cross-tab messaging |
| `src/injected/injected.js` | MAIN world script — intercepts `fetch` to capture real token counts from streaming responses |
| `src/content/content.js` | Isolated world orchestrator — merges data sources, tracks quota, broadcasts to popup |
| `src/content/platform-detector.js` | Detects current platform from hostname |
| `src/content/dom-extractor.js` | Extracts messages and model info from the page DOM |
| `src/core/token-counter.js` | BPE-approximate token counting |
| `src/core/text-analyzer.js` | Efficiency scoring, filler detection, top words |
| `src/core/cost-calculator.js` | Per-model pricing table, session cost calculation |
| `src/core/redundancy-detector.js` | N-gram phrase repetition detection |
| `src/core/quota-tracker.js` | Rolling-window token accounting via `chrome.storage.local` |
| `src/core/storage.js` | API key persistence via `chrome.storage.sync` |
| `src/core/api-client.js` | Calls Anthropic and Gemini token-count endpoints |
| `src/popup/popup.html/js/css` | Extension popup UI |
| `src/settings/settings.html/js/css` | Settings page for API keys and usage limits |

### Data Source Priority

```
API key active → /count_tokens endpoint (exact)
      ↓
Network intercept → Parses SSE stream from the AI platform's own API calls (exact)
      ↓
DOM estimation → Counts visible text on the page (approximate)
```

The active source is shown as a badge in the popup header: **API**, **Live**, or **~Est**.

## Getting Started

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- An active session on Claude, ChatGPT, or Gemini
- Optional: Anthropic or Gemini API key for exact token counts

### Installation

1. Clone or download this repository

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the `token-lens` folder

3. Start tracking:
   - Navigate to [claude.ai](https://claude.ai), [chatgpt.com](https://chatgpt.com), or [gemini.google.com](https://gemini.google.com)
   - Click the TokenLens icon in the Chrome toolbar
   - Start a conversation and watch the gauge fill in real time

### Optional: Connect an API Key

Adding an API key unlocks exact token counts via the platform's count API:

1. Click the settings icon (≡) in the popup header
2. Enter your Anthropic or Gemini API key
3. Click **Test** to verify, then **Save**

The source badge in the header will switch from **~Est** to **API** when the key is active.

> **Note:** ChatGPT does not expose a token-count endpoint — it always uses network interception or DOM estimation.

## Using the Extension

### Token Gauge

The circular arc at the top shows your **5-hour quota** usage (the rolling window Claude and other platforms enforce). The number in the centre is tokens remaining in that window.

- Grey → normal usage
- Amber → approaching limit (75%+)
- Red → near or at limit (90%+)

On platforms with no quota data, the gauge falls back to showing session tokens against the context window.

### Meta Cards

| Card | What it shows |
|---|---|
| Input | Tokens from your messages in this session |
| Output | Tokens from AI responses in this session |
| Est. Cost | Estimated API cost — visible only when an API key is connected |

### Quota Section

Shows your weekly token usage with a progress bar. A warning banner appears when you approach or exceed your 5-hour limit.

### Tabs

- **Top Words** — word frequency grid; amber chips are AI filler words
- **Optimize** — specific filler words to remove with estimated token savings
- **Redundancy** — repeated phrases detected across your messages

### Settings

Open via the ≡ button in the header:

- Add API keys for Anthropic and Gemini
- Set custom 5-hour and weekly quota limits per platform

## How It Works

```
1. Inject     → injected.js runs in MAIN world at document_start,
                wraps window.fetch before any platform scripts load

2. Intercept  → Clones response body, parses SSE stream to extract
                inputTokens / outputTokens from the platform's own API calls

3. Bridge     → Posts token counts via window.postMessage to the
                isolated content script world

4. Analyse    → content.js merges intercept data, API data, and DOM
                estimates; tracks rolling quota; pushes updates to popup

5. Display    → popup.js renders gauge, bars, and analysis panels;
                updates in real time via chrome.runtime.onMessage
```

## Project Structure

```
token-lens/
├── manifest.json                  # Extension config (MV3)
├── src/
│   ├── background/
│   │   └── service-worker.js      # Background worker
│   ├── injected/
│   │   └── injected.js            # Fetch interceptor (MAIN world)
│   ├── content/
│   │   ├── content.js             # Orchestrator
│   │   ├── platform-detector.js   # Hostname → platform mapping
│   │   └── dom-extractor.js       # Message + model extraction
│   ├── core/
│   │   ├── token-counter.js       # BPE token approximation
│   │   ├── text-analyzer.js       # Efficiency + filler analysis
│   │   ├── cost-calculator.js     # Pricing table + cost calc
│   │   ├── redundancy-detector.js # N-gram repetition detection
│   │   ├── quota-tracker.js       # Rolling window accounting
│   │   ├── api-client.js          # Anthropic + Gemini API calls
│   │   └── storage.js             # API key persistence
│   ├── popup/
│   │   ├── popup.html             # Extension popup
│   │   ├── popup.js               # Popup logic
│   │   └── popup.css              # Popup styles
│   └── settings/
│       ├── settings.html          # Settings page
│       ├── settings.js            # Settings logic
│       └── settings.css           # Settings styles
└── tests/
    ├── token-counter.test.js
    ├── text-analyzer.test.js
    ├── cost-calculator.test.js
    ├── redundancy-detector.test.js
    ├── platform-detector.test.js
    ├── storage.test.js
    ├── api-client.test.js
    ├── quota-tracker.test.js
    └── content-dom-recording.test.js
```

## Technical Details

### Token Interception

TokenLens intercepts the AI platform's own network calls by wrapping `window.fetch` before any platform scripts initialise. For streaming responses, it parses the SSE stream and extracts token counts from the platform's usage events:

- **Claude**: `message_start` (input tokens) and `message_delta` (output tokens)
- **OpenAI**: Final chunk with `usage` field
- **Gemini**: `usageMetadata` in the JSON response

This requires running in the `MAIN` world (`"world": "MAIN"` in manifest) at `document_start` so the wrapper is in place before the page's own scripts run.

### Quota Tracking

Token events are stored in `chrome.storage.local` as a timestamped array. Entries older than 7 days are pruned on each write. Usage is calculated by summing events within each rolling window (5-hour, 7-day) at query time. No server-side state is required.

### Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the current tab to extract conversation messages |
| `storage` | Persist API keys (sync) and token events / quota limits (local) |
| `scripting` | Inject content scripts into AI platform pages |
| Host permissions | Required for API key calls to Anthropic and Gemini endpoints |

## Testing

The extension includes a full Jest test suite (154 tests across 9 suites) covering all core modules.

```bash
npm install
npm test
```

Tests use the IIFE + dual-export pattern (`window.TokenLens` + `module.exports`) so all modules run in both browser and Node environments without modification.

## Troubleshooting

### Extension Not Working

- Confirm the extension is enabled at `chrome://extensions/`
- Reload the extension after making any file changes
- Hard-refresh the AI platform page (Cmd/Ctrl + Shift + R)

### Quota Bars Show 0

- The 5-hour and weekly bars fill from **network-intercepted** or **DOM-estimated** data
- If you have just installed the extension, bars start at 0 and fill as you use the platform
- Check the source badge: if it shows **~Est**, interception is not active for this session type

### OUTPUT Shows 0

- The extension reads AI messages from the DOM using multiple selector fallbacks
- If the platform has recently updated its UI, selectors may need refreshing — open an issue

### API Key Not Working

- Claude requires an Anthropic API key at console.anthropic.com
- Gemini requires a Google AI Studio key at aistudio.google.com
- ChatGPT does not support API-based token counting in this extension

## Use Cases

- **Subscription management**: Track how fast you burn through the 5-hour Claude window
- **Prompt optimisation**: Identify filler words and redundant phrasing to reduce token spend
- **Cost tracking**: See real API costs when using the extension with a pay-per-token key
- **Research**: Understand how token consumption scales across conversation types
- **Team training**: Demonstrate efficient prompting practices with live data

## Contributing

Contributions are welcome.

- Report bugs via GitHub Issues
- Suggest features or improvements
- Submit pull requests — please include or update tests

## License

ISC
