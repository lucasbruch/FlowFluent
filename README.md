# FlowFluent

A Chrome extension that fixes, rewrites, and translates selected text using a local [Ollama](https://ollama.com) model. **100% private. No data ever leaves your machine.**

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-000?logo=ollama&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Fix writing**: correct grammar and spelling in your chosen style (Easy / Business / Academic)
- **Shorten / Lengthen**: trim or expand selected text while keeping the tone
- **Tone rewrite**: switch to CEO, Friendlier, or Professional voice
- **Translate**: EN to DE and DE to EN in one click
- Works via **right-click context menu** or the **popup**
- Inline **word-level diff** so you see exactly what changed
- Supports **English and German** natively


## Prerequisites

1. **[Ollama](https://ollama.com/download)** installed and running locally
2. A pulled model. Recommended picks:

   | Badge | Model | Size | Notes |
   |-------|-------|------|-------|
   | Best pick | `gemma4:e4b` | ~3 GB | Fast, great EN + DE |
   | Fastest | `qwen2.5:3b` | 1.9 GB | Snappy, solid EN + DE |
   | Best quality | `qwen2.5:7b` | 4.7 GB | Better output with a GPU |

   ```bash
   ollama pull qwen2.5:3b
   ```

3. **Allow browser access** (one-time setup):

   **Windows**: run in Command Prompt or PowerShell:
   ```cmd
   setx OLLAMA_ORIGINS "*"
   ```

   **macOS / Linux**: add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):
   ```bash
   export OLLAMA_ORIGINS="*"
   ```

   Then **restart Ollama** (quit from the tray icon and relaunch, or run `ollama serve`).


## Installation

### Option A: Load unpacked (developer mode)

1. Download or clone this repo:
   ```bash
   git clone https://github.com/lucasbruch/FlowFluent.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the cloned folder

### Option B: Install from ZIP

1. Download `FlowFluent.zip` from the [Releases](../../releases) page
2. Unzip it
3. Follow steps 2 to 4 from Option A


## Usage

### Right-click menu
Select any text on a page, right-click, then choose one of:
- **Fix this writing**
- **Translate to German**
- **Translate to English**

The result appears in an overlay on the page. From there you can further shorten, lengthen, change tone, translate, then hit **Replace** to swap the text in place.

### Popup
Click the FlowFluent icon in the toolbar while text is selected, then click **Fix this writing**.


## Settings

Click the gear icon in the popup, or go to `chrome://extensions`, find FlowFluent, click **Details**, then **Extension options**.

| Setting | Description |
|---------|-------------|
| Writing style | Easy, Business, or Academic |
| Ollama URL | Default: `http://localhost:11434` |
| Model | Auto-loaded from your running Ollama instance |

Use **Test connection** to verify Ollama is reachable and load available models.


## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot reach Ollama` | Make sure Ollama is running: `ollama serve` |
| `403 Forbidden` | Re-run `setx OLLAMA_ORIGINS "*"` and restart Ollama |
| Model not in dropdown | Pull it first: `ollama pull <model>`, then re-test connection |
| Extension not responding | Reload it at `chrome://extensions` after installing a new version |


## License

MIT
