# FlowFluent

A Chrome extension that fixes your writing, rewrites it in a different tone, or translates between English and German. It runs on your own computer using a free tool called Ollama, so **nothing you write is ever sent to the internet**.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-000?logo=ollama&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

![FlowFluent in action](docs/screenshots/usage.png)


## What it does

- **Fix writing**: corrects grammar and spelling
- **Shorten / Lengthen**: makes text shorter or longer
- **Change tone**: rewrites text as a CEO, friendlier, or more professional
- **Translate**: between English and German
- Works in any text box on any website
- Shows you exactly what changed before you accept it


## Before you start

You need three things:
1. **Google Chrome** (you probably already have this)
2. **Ollama** (a free program that runs the AI on your computer)
3. **An AI model** (a file Ollama downloads for you)

Don't worry, the steps below walk you through each one.


## Step 1: Install Ollama

Ollama is the engine that powers FlowFluent. It's free and runs entirely on your own computer.

### On Windows
1. Go to [https://ollama.com/download](https://ollama.com/download)
2. Click the big **Download for Windows** button
3. Open the file you just downloaded (it's called `OllamaSetup.exe`)
4. Click **Install** and wait for it to finish
5. Ollama will start automatically. You'll see a small llama icon near your clock in the bottom-right corner of your screen.

### On Mac
1. Go to [https://ollama.com/download](https://ollama.com/download)
2. Click **Download for macOS**
3. Open the file you just downloaded
4. Drag the Ollama icon into your **Applications** folder
5. Open Ollama from your Applications folder
6. You'll see a llama icon in the top-right menu bar of your screen.

### On Linux
Open a terminal and paste this command:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```


## Step 2: Allow Chrome to talk to Ollama

By default, Ollama only talks to programs on your computer. We need to give it permission to talk to your browser.

### On Windows
1. Press the **Windows key**, type `cmd`, and press **Enter** to open Command Prompt
2. Copy and paste this line, then press **Enter**:
   ```cmd
   setx OLLAMA_ORIGINS "*"
   ```
3. You should see `SUCCESS: Specified value was saved.`
4. **Restart Ollama**: right-click the llama icon near your clock, choose **Quit**, then open Ollama again from your Start menu

### On Mac
1. Open the **Terminal** app (search for it with Spotlight: press `Cmd + Space`, type `Terminal`)
2. Copy and paste this line, then press **Enter**:
   ```bash
   launchctl setenv OLLAMA_ORIGINS "*"
   ```
3. **Restart Ollama**: click the llama icon in the menu bar, choose **Quit**, then reopen Ollama from Applications

### On Linux
Add this line to your shell profile (`~/.bashrc` or `~/.zshrc`):
```bash
export OLLAMA_ORIGINS="*"
```
Then restart Ollama: `pkill ollama && ollama serve`


## Step 3: Download an AI model

Now we tell Ollama which AI to use. We recommend **qwen2.5:3b**: it's small, fast, and works well in both English and German.

1. Open a terminal:
   - **Windows**: press the Windows key, type `cmd`, press Enter
   - **Mac**: open Terminal (`Cmd + Space`, type Terminal)
   - **Linux**: open your terminal app
2. Copy and paste this command, then press **Enter**:
   ```bash
   ollama pull qwen2.5:3b
   ```
3. Wait for the download to finish (about 1.9 GB, usually 2 to 5 minutes on a normal connection)
4. When you see your prompt again with no error, it's done.

### Other models you can try later
| Model | Size | Best for |
|-------|------|----------|
| `qwen2.5:3b` | 1.9 GB | Fast on any computer (recommended starting point) |
| `gemma4:e4b` | ~3 GB | Better quality, still fast |
| `qwen2.5:7b` | 4.7 GB | Best quality, needs a decent GPU |

To install another model later, run `ollama pull <name>` with the name from the table.


## Step 4: Install FlowFluent in Chrome

1. Download this project as a ZIP:
   - Click the green **Code** button at the top of [this page](https://github.com/lucasbruch/FlowFluent)
   - Click **Download ZIP**
2. Unzip the file (right-click, **Extract All** on Windows; double-click on Mac)
3. Open Chrome
4. In the address bar, type `chrome://extensions` and press **Enter**
5. In the top-right corner of that page, turn on **Developer mode**
6. Click **Load unpacked** (top-left)
7. Select the folder you unzipped in step 2
8. FlowFluent now appears in your extensions list. Pin it to your toolbar by clicking the puzzle-piece icon next to your address bar, then the pin icon next to FlowFluent.


## Step 5: Try it out

1. Go to any website with a text box (like Gmail, a Google Doc, or a comment field)
2. Type a sentence with a typo, for example: `i think this is realy gud`
3. Select the sentence with your mouse
4. Right-click and choose **Fix this writing**
5. A small box appears in the top-right of the page showing the corrected text with the changes highlighted
6. Click **Replace** to put the fixed text into the text box, or **Discard** if you don't like it.

![Result overlay](docs/screenshots/overlay.png)

You can also try **Translate to German** or **Translate to English** from the same right-click menu.


## Settings

Click the FlowFluent icon ![icon](docs/screenshots/toolbar-icon.png) in your Chrome toolbar, then click the gear icon. From there you can:
- Change the writing style (Easy, Business, or Academic)
- Pick a different AI model
- Test the connection to Ollama

![Settings page](docs/screenshots/settings.png)


## Something went wrong?

| Problem | What to do |
|---------|------------|
| **"Cannot reach Ollama"** | Make sure Ollama is running. Check for the llama icon near your clock (Windows) or menu bar (Mac). If it's missing, open Ollama again. |
| **"403 Forbidden"** | You skipped step 2, or didn't restart Ollama after step 2. Do step 2 again, then fully quit and reopen Ollama. |
| **Model dropdown is empty** | You haven't pulled a model yet. Go back to step 3. |
| **Right-click menu doesn't show "Fix this writing"** | Reload the extension: go to `chrome://extensions`, find FlowFluent, click the refresh icon. |
| **Result is slow** | Big models are slower. Try the smallest one (`qwen2.5:3b`) first. |


## License

MIT
