// background.js — service worker

importScripts('prompts.js');

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const CLOUD_CATALOG_URL  = 'https://ollama.com/api/tags';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'fixMyWriting',        title: 'Fix this writing',      contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translateToGerman',   title: 'Translate to German',   contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translateToEnglish',  title: 'Translate to English',  contexts: ['selection'] });
});

const MENU_ACTIONS = {
  fixMyWriting:       'fixText',
  translateToGerman:  'translateToGerman',
  translateToEnglish: 'translateToEnglish',
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = MENU_ACTIONS[info.menuItemId];
  if (!action || !info.selectionText) return;
  if (!tab?.id || tab.id < 0) return;

  const msg = { action, text: info.selectionText };

  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Content script not present — tab was open before the extension was
    // installed or last reloaded. Inject now and retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch {
      // Truly inaccessible page (chrome://, PDF viewer, etc.) — nothing we can do.
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'getOllamaModels') {
    getOllamaModels(message.ollamaUrl, message.currentModel)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  if (message?.action === 'transformText') {
    runTransform({
      inputText: message.text,
      type: message.type || 'fix',
      tone: message.tone || null,
      stream: false
    })
      .then(result => sendResponse({ success: true, text: result }))
      .catch(err => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ollama-transform') return;

  let controller = null;
  port.onDisconnect.addListener(() => {
    if (controller) controller.abort();
  });

  port.onMessage.addListener(message => {
    if (message?.action !== 'start') return;

    controller = new AbortController();
    runTransform({
      inputText: message.text,
      type: message.type || 'fix',
      tone: message.tone || null,
      stream: true,
      signal: controller.signal,
      onChunk: text => port.postMessage({ type: 'chunk', text })
    })
      .then(text => port.postMessage({ type: 'done', text }))
      .catch(err => {
        if (err?.name === 'AbortError') return;
        port.postMessage({ type: 'error', error: friendlyError(err) });
      });
  });
});

async function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(
      { ollamaUrl: DEFAULT_OLLAMA_URL, model: '', style: DEFAULT_STYLE },
      result => chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(result)
    );
  });
}

async function getOllamaModels(ollamaUrlOverride, currentModel) {
  const settings = await getSettings();
  const ollamaUrl = cleanBaseUrl(ollamaUrlOverride || settings.ollamaUrl || DEFAULT_OLLAMA_URL);
  const savedModel = currentModel || settings.model || '';

  const [local, cloud] = await Promise.all([
    fetchLocalModels(ollamaUrl).catch(err => ({ ok: false, error: friendlyError(err), models: [] })),
    fetchCloudCatalog().catch(err => ({ ok: false, error: friendlyError(err), models: [] }))
  ]);

  const localModels = local.models || [];
  const cloudModels = cloud.models || [];
  const localNames = new Set(localModels.map(model => model.name));
  const selectedModel = chooseModel(localModels, savedModel);
  const cloudSuggestions = cloudModels
    .map(model => ({
      ...model,
      cloudName: toCloudModelName(model.name),
      installed: localNames.has(model.name) || localNames.has(toCloudModelName(model.name))
    }))
    .filter(model => model.name && !model.installed);

  return {
    success: true,
    ollamaUrl,
    local,
    cloud: {
      ok: cloud.ok,
      error: cloud.error || '',
      models: cloudSuggestions
    },
    selectedModel,
    savedModelMissing: Boolean(savedModel && selectedModel && savedModel !== selectedModel),
    extensionOrigin: `chrome-extension://${chrome.runtime.id}`
  };
}

async function fetchLocalModels(ollamaUrl) {
  const res = await fetch(`${cleanBaseUrl(ollamaUrl)}/api/tags`);
  if (!res.ok) throw ollamaHttpError(res, await readBody(res));

  const data = await res.json();
  return {
    ok: true,
    error: '',
    models: normalizeModels(data.models || [])
  };
}

async function fetchCloudCatalog() {
  const res = await fetch(CLOUD_CATALOG_URL);
  if (!res.ok) throw new Error(`Cloud catalog error ${res.status}: ${await readBody(res) || res.statusText}`);

  const data = await res.json();
  return {
    ok: true,
    error: '',
    models: normalizeModels(data.models || [])
  };
}

function normalizeModels(models) {
  return models
    .map(model => {
      const name = model.name || model.model || '';
      return {
        name,
        model: model.model || name,
        size: Number(model.size || 0),
        modifiedAt: model.modified_at || '',
        parameterSize: model.details?.parameter_size || '',
        family: model.details?.family || ''
      };
    })
    .filter(model => model.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function chooseModel(models, savedModel) {
  if (!models.length) return '';
  return models.find(model => model.name === savedModel)?.name
      || models.find(model => savedModel && model.name.startsWith(savedModel + ':'))?.name
      || models[0].name;
}

function toCloudModelName(name) {
  if (!name || /(^|[-:])cloud$/i.test(name)) return name;
  return `${name}-cloud`;
}

async function runTransform({ inputText, type, tone, stream, signal, onChunk }) {
  if (!inputText || !inputText.trim()) throw new Error('Select some text first.');

  const settings = await getSettings();
  let model = settings.model;
  if (!model) {
    const local = await fetchLocalModels(settings.ollamaUrl);
    model = chooseModel(local.models, '');
    if (model) chrome.storage.sync.set({ model });
  }

  if (!model) {
    throw new Error('No Ollama models are installed yet. Open FlowFluent settings to choose a local or cloud model to add.');
  }

  const prompt = buildPrompt(inputText, type, settings, tone);
  let res = await fetchGenerate(settings.ollamaUrl, model, prompt, stream, signal);

  if (res.status === 404) {
    const local = await fetchLocalModels(settings.ollamaUrl);
    const fallbackModel = chooseModel(local.models, model);
    if (fallbackModel && fallbackModel !== model) {
      model = fallbackModel;
      chrome.storage.sync.set({ model });
      res = await fetchGenerate(settings.ollamaUrl, model, prompt, stream, signal);
    }
  }

  if (!res.ok) throw ollamaHttpError(res, await readBody(res));

  if (!stream) {
    const data = await res.json();
    return (data.response || '').trim();
  }

  return readGenerateStream(res, onChunk);
}

function fetchGenerate(ollamaUrl, model, prompt, stream, signal) {
  return fetch(`${cleanBaseUrl(ollamaUrl)}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: Boolean(stream) }),
    signal
  });
}

async function readGenerateStream(response, onChunk) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const result = readGenerateLine(line, accumulated);
      accumulated = result.accumulated;
      if (result.changed) onChunk?.(accumulated);
      if (result.done) return accumulated.trim();
    }
  }

  const result = readGenerateLine(buffer, accumulated);
  accumulated = result.accumulated;
  if (result.changed) onChunk?.(accumulated);

  return accumulated.trim();
}

function readGenerateLine(line, accumulated) {
  if (!line.trim()) return { accumulated, changed: false, done: false };

  let parsed;
  try { parsed = JSON.parse(line); } catch { return { accumulated, changed: false, done: false }; }

  if (parsed.response) {
    return {
      accumulated: accumulated + parsed.response,
      changed: true,
      done: Boolean(parsed.done)
    };
  }

  return { accumulated, changed: false, done: Boolean(parsed.done) };
}

function cleanBaseUrl(url) {
  return (url || DEFAULT_OLLAMA_URL).trim().replace(/\/+$/, '');
}

async function readBody(response) {
  return response.text().catch(() => '');
}

function ollamaHttpError(response, body) {
  const err = new Error(body || response.statusText || `HTTP ${response.status}`);
  err.status = response.status;
  err.body = body;
  return err;
}

function friendlyError(err) {
  if (err?.status === 403) {
    const origin = `chrome-extension://${chrome.runtime.id}`;
    return `Ollama blocked FlowFluent. Open FlowFluent settings, use Init browser access, then restart Ollama. Extension origin: ${origin}`;
  }

  const message = err?.message || String(err || 'Unknown error');
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) {
    return `Cannot reach Ollama at ${DEFAULT_OLLAMA_URL}. Make sure the Ollama app is open.`;
  }
  if (/not found|model/i.test(message) && /signin|unauthorized|auth|cloud/i.test(message)) {
    return 'Ollama could not run that cloud model. Run `ollama signin`, then refresh FlowFluent.';
  }
  if (/unauthorized|forbidden|auth|signin/i.test(message)) {
    return 'Ollama needs you to sign in before using that cloud model. Run `ollama signin`, then try again.';
  }
  return message;
}
