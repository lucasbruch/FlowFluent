// options.js

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_STYLE      = 'easy';

const urlInput       = document.getElementById('ollama-url');
const modelSelect    = document.getElementById('model-select');
const modelHint      = document.getElementById('model-hint');
const btnSave        = document.getElementById('btn-save');
const btnTest        = document.getElementById('btn-test');
const status         = document.getElementById('status');
const testResult     = document.getElementById('test-result');
const cloudModelList = document.getElementById('cloud-model-list');
const statusOllama   = document.getElementById('status-ollama');
const statusModels   = document.getElementById('status-models');
const statusCloud    = document.getElementById('status-cloud');
const originHint     = document.getElementById('origin-hint');
const originSetup    = document.getElementById('origin-setup');
const originCommand  = document.getElementById('origin-command');
const originIntro    = document.getElementById('origin-command-intro');
const originRestart  = document.getElementById('origin-restart-hint');
const btnCopyOrigin  = document.getElementById('btn-copy-origin');

let savedModel = '';
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;

showOriginSetup(extensionOrigin);

// ---------- Copy buttons ----------

document.addEventListener('click', evt => {
  const btn = evt.target.closest('[data-copy], .btn-pull');
  if (!btn) return;

  const text = btn.dataset.copy || `ollama pull ${btn.dataset.model}`;
  navigator.clipboard.writeText(text).then(() => {
    const previous = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = previous;
      btn.classList.remove('copied');
    }, 2000);
  });
});

// ---------- Load saved settings, then refresh Ollama ----------

chrome.storage.sync.get(
  { ollamaUrl: DEFAULT_OLLAMA_URL, model: '', style: DEFAULT_STYLE },
  ({ ollamaUrl, model, style }) => {
    urlInput.value = ollamaUrl;
    savedModel = model || '';
    setStyle(style);
    refreshOllama(true);
  }
);

function setStyle(value) {
  const radio = document.querySelector(`input[name="style"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function getStyle() {
  return document.querySelector('input[name="style"]:checked')?.value ?? DEFAULT_STYLE;
}

// ---------- Refresh / save ----------

btnTest.addEventListener('click', () => refreshOllama(false));

btnSave.addEventListener('click', () => {
  const ollamaUrl = cleanBaseUrl(urlInput.value) || DEFAULT_OLLAMA_URL;
  const model = modelSelect.value || savedModel;
  const style = getStyle();

  if (!model) {
    showTest('Choose an installed model first, or copy a cloud pull command and refresh Ollama.', 'err');
    return;
  }

  savedModel = model;
  chrome.storage.sync.set({ ollamaUrl, model, style }, () => {
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2000);
  });
});

async function refreshOllama(silent) {
  const ollamaUrl = cleanBaseUrl(urlInput.value) || DEFAULT_OLLAMA_URL;
  setLoading();
  if (!silent) showTest('Refreshing Ollama...', '');

  const response = await chrome.runtime.sendMessage({
    action: 'getOllamaModels',
    ollamaUrl,
    currentModel: savedModel
  }).catch(err => ({ success: false, error: err.message }));

  if (!response?.success) {
    renderLocalModels([], '');
    renderCloudModels([]);
    setStatus(statusOllama, 'err', response?.error || 'Cannot reach Ollama.');
    setStatus(statusModels, 'warn', 'No installed models could be loaded yet.');
    setStatus(statusCloud, 'warn', 'Cloud catalog was not loaded.');
    originHint.textContent = `Use Init browser access if Ollama blocks this extension: ${extensionOrigin}`;
    showOriginSetup(extensionOrigin);
    showTest(response?.error || 'Cannot reach Ollama.', 'err');
    return;
  }

  renderLocalModels(response.local.models, response.selectedModel);
  renderCloudModels(response.cloud.models);
  updateStatus(response);

  if (response.selectedModel) {
    savedModel = response.selectedModel;
    chrome.storage.sync.set({ ollamaUrl, model: response.selectedModel });
  }

  if (!silent) {
    if (response.local.models.length) {
      showTest(`Found ${response.local.models.length} installed model${response.local.models.length === 1 ? '' : 's'}.`, 'ok');
    } else {
      showTest('Ollama is running, but no models are installed yet.', 'warn');
    }
  }
}

function setLoading() {
  modelSelect.disabled = true;
  modelSelect.innerHTML = '<option value="">Loading installed models...</option>';
  modelHint.textContent = 'Reading installed models from the Ollama app.';
  cloudModelList.innerHTML = '<div class="empty-state">Loading cloud models...</div>';
  setStatus(statusOllama, '', 'Checking whether the Ollama app is reachable.');
  setStatus(statusModels, '', 'Looking for installed local or cloud models.');
  setStatus(statusCloud, '', 'Loading Ollama\'s public cloud model catalog.');
  originHint.textContent = `Use Init browser access if Ollama blocks this extension: ${extensionOrigin}`;
  showOriginSetup(extensionOrigin);
}

function renderLocalModels(models, selectedModel) {
  modelSelect.innerHTML = '';

  if (!models.length) {
    modelSelect.disabled = true;
    modelSelect.innerHTML = '<option value="">No installed models found</option>';
    modelHint.textContent = 'Copy a local or cloud model pull command, run it in Terminal, then refresh Ollama.';
    return;
  }

  for (const model of models) {
    const opt = document.createElement('option');
    opt.value = model.name;
    opt.textContent = model.name;
    if (model.name === selectedModel) opt.selected = true;
    modelSelect.appendChild(opt);
  }

  modelSelect.disabled = false;
  modelHint.textContent = `${models.length} installed model${models.length === 1 ? '' : 's'} found in Ollama.`;
  savedModel = modelSelect.value;
}

modelSelect.addEventListener('change', () => {
  savedModel = modelSelect.value;
});

function renderCloudModels(models) {
  cloudModelList.innerHTML = '';

  if (!models.length) {
    cloudModelList.innerHTML = '<div class="empty-state">No extra cloud models are available right now, or the catalog could not be loaded.</div>';
    return;
  }

  for (const model of models) {
    const row = document.createElement('div');
    row.className = 'suggestion';

    const badge = document.createElement('span');
    badge.className = 'suggestion-badge badge-quality';
    badge.textContent = 'Cloud';

    const info = document.createElement('div');
    info.className = 'suggestion-info';

    const name = document.createElement('div');
    name.className = 'suggestion-name';
    name.textContent = model.cloudName;

    const desc = document.createElement('div');
    desc.className = 'suggestion-desc';
    desc.textContent = model.parameterSize || model.family || 'Available through Ollama Cloud';

    const size = document.createElement('span');
    size.className = 'suggestion-size';
    size.textContent = formatSize(model.size);

    const btn = document.createElement('button');
    btn.className = 'btn-pull';
    btn.dataset.model = model.cloudName;
    btn.textContent = 'Copy';

    info.append(name, desc);
    row.append(badge, info, size, btn);
    cloudModelList.appendChild(row);
  }
}

function updateStatus(response) {
  if (response.local.ok) {
    setStatus(statusOllama, 'ok', `Connected to Ollama at ${response.ollamaUrl}.`);
  } else {
    setStatus(statusOllama, 'err', response.local.error || 'Cannot reach Ollama. Open the Ollama app, then refresh.');
  }

  if (response.local.models.length) {
    const missing = response.savedModelMissing ? ' Your previous model was missing, so FlowFluent selected another installed model.' : '';
    setStatus(statusModels, 'ok', `${response.local.models.length} installed model${response.local.models.length === 1 ? '' : 's'} available.${missing}`);
  } else {
    setStatus(statusModels, 'warn', 'No models are installed. Pull any local model, or sign in and pull a cloud model.');
  }

  if (response.cloud.ok) {
    setStatus(statusCloud, 'ok', `${response.cloud.models.length} cloud model suggestion${response.cloud.models.length === 1 ? '' : 's'} loaded from Ollama.`);
  } else {
    setStatus(statusCloud, 'warn', response.cloud.error || 'Cloud catalog unavailable. Local models still work.');
  }

  if (response.local.error && /blocked|403|forbidden/i.test(response.local.error)) {
    originHint.textContent = 'Ollama is blocking this extension. Run the init command below once, restart Ollama, then refresh.';
    showOriginSetup(response.extensionOrigin);
  } else {
    originHint.textContent = `Use Init browser access if Ollama blocks this extension: ${response.extensionOrigin}`;
    showOriginSetup(response.extensionOrigin);
  }
}

function setStatus(el, kind, text) {
  el.className = `status-item${kind ? ` ${kind}` : ''}`;
  el.querySelector('span:last-child').textContent = text;
}

function showTest(message, kind) {
  testResult.textContent = message;
  testResult.className = kind || '';
}

function cleanBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function showOriginSetup(extensionOrigin) {
  const setup = buildOriginSetup(extensionOrigin);
  originIntro.textContent = setup.intro;
  originCommand.textContent = setup.command;
  originRestart.textContent = setup.restart;
  btnCopyOrigin.dataset.copy = setup.command;
  originSetup.classList.remove('hidden');
}

function buildOriginSetup(extensionOrigin) {
  const platform = getPlatform();

  if (platform === 'windows') {
    return {
      intro: 'Open Command Prompt, paste this command, then press Enter.',
      command: `setx OLLAMA_ORIGINS "${extensionOrigin}"`,
      restart: 'After it says SUCCESS, quit Ollama from the tray icon and open it again.'
    };
  }

  if (platform === 'linux') {
    return {
      intro: 'Start Ollama with this environment value, or add it to your service/shell setup.',
      command: `OLLAMA_ORIGINS="${extensionOrigin}" ollama serve`,
      restart: 'Stop any running Ollama process first, then run the command and refresh FlowFluent.'
    };
  }

  return {
    intro: 'Open Terminal, paste this command, then press Enter.',
    command: `launchctl setenv OLLAMA_ORIGINS "${extensionOrigin}"`,
    restart: 'Then quit Ollama from the menu bar and open it again from Applications.'
  };
}

function getPlatform() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux')) return 'linux';
  return 'mac';
}

function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / 1000 / 1000 / 1000;
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}
