// options.js

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL      = 'qwen2.5:3b';
const DEFAULT_STYLE      = 'easy';

const urlInput    = document.getElementById('ollama-url');
const modelSelect = document.getElementById('model-select');
const modelHint   = document.getElementById('model-hint');
const btnSave     = document.getElementById('btn-save');
const btnTest     = document.getElementById('btn-test');
const status      = document.getElementById('status');
const testResult  = document.getElementById('test-result');

let savedModel = DEFAULT_MODEL;

// ---------- Setup: copy env variable command ----------

document.querySelectorAll('.btn-copy-cmd').forEach(btn => {
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(btn.dataset.cmd).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  });
});

// ---------- Suggested models: copy pull command ----------

document.querySelectorAll('.btn-pull').forEach(btn => {
  btn.addEventListener('click', () => {
    const model = btn.dataset.model;
    navigator.clipboard.writeText(`ollama pull ${model}`).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  });
});

// ---------- Load saved settings, then try to fetch models ----------

chrome.storage.sync.get(
  { ollamaUrl: DEFAULT_OLLAMA_URL, model: DEFAULT_MODEL, style: DEFAULT_STYLE },
  ({ ollamaUrl, model, style }) => {
    urlInput.value = ollamaUrl;
    savedModel     = model;
    setStyle(style);
    fetchModels(ollamaUrl, model, /* silent = */ true);
  }
);

function setStyle(value) {
  const radio = document.querySelector(`input[name="style"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function getStyle() {
  return document.querySelector('input[name="style"]:checked')?.value ?? DEFAULT_STYLE;
}

// ---------- Test connection ----------

btnTest.addEventListener('click', async () => {
  const url = urlInput.value.trim() || DEFAULT_OLLAMA_URL;
  testResult.textContent = 'Connecting…';
  testResult.className   = '';
  await fetchModels(url, savedModel, /* silent = */ false);
});

// ---------- Save ----------

btnSave.addEventListener('click', () => {
  const ollamaUrl = urlInput.value.trim() || DEFAULT_OLLAMA_URL;
  const model     = modelSelect.value     || savedModel;
  const style     = getStyle();

  if (!model) { testResult.textContent = 'Select a model first.'; testResult.className = 'err'; return; }

  savedModel = model;
  chrome.storage.sync.set({ ollamaUrl, model, style }, () => {
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2000);
  });
});

// ---------- Core: fetch model list from Ollama ----------

async function fetchModels(ollamaUrl, currentModel, silent) {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data   = await res.json();
    const models = (data.models || []).map(m => m.name).sort();

    if (models.length === 0) {
      if (!silent) {
        testResult.textContent = 'Connected, but no models installed yet. Run: ollama pull llama3.2';
        testResult.className   = 'err';
      }
      return;
    }

    populateSelect(models, currentModel);

    if (!silent) {
      testResult.textContent = `Connected — ${models.length} model${models.length !== 1 ? 's' : ''} found.`;
      testResult.className   = 'ok';
    }

  } catch (err) {
    if (!silent) {
      testResult.textContent = `Cannot reach Ollama: ${err.message}`;
      testResult.className   = 'err';
    }
  }
}

// ---------- Populate the <select> ----------

function populateSelect(models, currentModel) {
  modelSelect.innerHTML = '';

  // Best match: exact name, or name without tag (e.g. "llama3.2" matches "llama3.2:latest")
  const match = models.find(n => n === currentModel)
             ?? models.find(n => n.startsWith(currentModel + ':'))
             ?? models[0];

  for (const name of models) {
    const opt      = document.createElement('option');
    opt.value      = name;
    opt.textContent = name;
    if (name === match) opt.selected = true;
    modelSelect.appendChild(opt);
  }

  modelSelect.disabled = false;
  modelHint.textContent = `${models.length} model${models.length !== 1 ? 's' : ''} available.`;

  // Keep savedModel in sync with whatever is now selected.
  savedModel = modelSelect.value;
  modelSelect.addEventListener('change', () => { savedModel = modelSelect.value; });
}
