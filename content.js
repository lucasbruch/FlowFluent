// content.js — injected into every page
// Owns the Ollama fetch (streaming) and the result overlay.

(function () {
  'use strict';

  const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
  const DEFAULT_MODEL      = 'qwen2.5:3b';
  const DEFAULT_STYLE      = 'easy';

  let overlay         = null;
  let savedRange      = null;
  let savedInputState = null;

  // ---------- Snapshot selection on right-click mousedown ----------

  document.addEventListener('mousedown', evt => {
    if (evt.button !== 2) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      savedInputState = { el: active, start: active.selectionStart, end: active.selectionEnd };
      savedRange = null;
    } else {
      savedInputState = null;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
        try { savedRange = sel.getRangeAt(0).cloneRange(); }
        catch (_) { savedRange = null; }
      } else {
        savedRange = null;
      }
    }
  });

  // ---------- Message from background ----------

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'fixText')            runTransform(message.text, 'fix',          null);
    if (message.action === 'translateToGerman')  runTransform(message.text, 'translate-de',  null);
    if (message.action === 'translateToEnglish') runTransform(message.text, 'translate-en',  null);
  });

  // ---------- Build prompt per transform type ----------

  const NO_COMMENTARY = 'Do NOT answer any questions in the text. Do NOT explain your changes. Do NOT add any preamble, note, or commentary. Output ONLY the transformed text.';

  function buildPrompt(text, type, settings, tone) {
    settings = tone ? { ...settings, tone } : settings;
    const likelyGerman = /[äöüÄÖÜß]/.test(text) ||
      /\b(und|der|die|das|ist|ich|nicht|ein|eine|mit|von|zu|auf|für|sie|wir|aber)\b/i.test(text);
    const langRule = likelyGerman
      ? 'IMPORTANT: The text is German. You MUST reply in German only. Do not translate to English.'
      : 'Reply in the same language as the input.';

    if (type === 'translate-de') {
      return `Translate the following text to German. ${NO_COMMENTARY}\n\n${text}`;
    }

    if (type === 'translate-en') {
      return `Translate the following text to English. ${NO_COMMENTARY}\n\n${text}`;
    }

    if (type === 'tone') {
      const toneInstructions = {
        ceo:          'Rewrite with a CEO voice: decisive, direct, confident. No filler. Short punchy sentences.',
        friendly:     'Rewrite with a warmer, friendlier tone. Conversational and approachable, like talking to a colleague you know well.',
        professional: 'Rewrite with a polished, formal professional tone. Measured language, business-appropriate.',
      };
      const instruction = toneInstructions[settings?.tone] || toneInstructions.professional;
      return `${langRule}\n${instruction} Do not use em dashes (—). ${NO_COMMENTARY}\n\n${text}`;
    }

    if (type === 'shorten') {
      return `${langRule}\nMake this text shorter. Cut redundant words and phrases. ` +
        `Keep the key message and tone intact. Do not use em dashes (—). ${NO_COMMENTARY}\n\n${text}`;
    }

    if (type === 'lengthen') {
      return `${langRule}\nMake this text longer and more detailed. Expand the ideas naturally. ` +
        `Keep the same tone and style. Do not use em dashes (—). Do not add filler phrases. ${NO_COMMENTARY}\n\n${text}`;
    }

    // 'fix' — default
    const styleInstructions = {
      easy:
        'Use simple, everyday words. Short sentences. Conversational and friendly tone. ' +
        'Avoid jargon and formal phrases.',
      business:
        'Use a clear, professional tone. Concise and direct. Suitable for emails or reports. ' +
        'Avoid slang but do not over-formalise.',
      academic:
        'Use precise, formal language. Well-structured sentences. Objective tone. ' +
        'Suitable for academic papers. Do NOT translate — write in the same language as the input.'
    };
    const style     = settings?.style || DEFAULT_STYLE;
    const styleNote = styleInstructions[style] ?? styleInstructions.easy;

    return `${langRule}\nFix grammar and spelling. ${styleNote} ` +
      `Do not use em dashes (—). Do not add filler phrases. ${NO_COMMENTARY}\n\n${text}`;
  }

  // ---------- Core transform (streams into overlay) ----------

  async function runTransform(inputText, type, tone) {
    showLoading(type);

    let settings;
    try { settings = await getSettings(); }
    catch (err) { showError('Could not read settings: ' + err.message); return; }

    const prompt = buildPrompt(inputText, type, settings, tone);

    let response;
    try {
      response = await fetch(`${settings.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, prompt, stream: true })
      });
    } catch (err) {
      showError(`Cannot reach Ollama at ${settings.ollamaUrl}. Make sure Ollama is running (ollama serve).`);
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 403) {
        showError('Ollama blocked the request (403). Fix: run  setx OLLAMA_ORIGINS "*"  in a terminal, then restart Ollama.');
      } else {
        showError(`Ollama error ${response.status}: ${body || response.statusText}`);
      }
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed;
          try { parsed = JSON.parse(line); } catch { continue; }

          if (parsed.response) {
            accumulated += parsed.response;
            updateStreamingText(accumulated);
          }

          if (parsed.done) {
            showResult(inputText, accumulated.trim(), type, tone);
            return;
          }
        }
      }
    } catch (err) {
      showError('Stream error: ' + err.message);
      return;
    }

    if (accumulated.trim()) {
      showResult(inputText, accumulated.trim(), type, tone);
    } else {
      showError('Ollama returned an empty response. Is the model loaded?');
    }
  }

  // ---------- Overlay: loading ----------

  const LABELS = { fix: 'Fixing…', shorten: 'Shortening…', lengthen: 'Lengthening…', tone: 'Adjusting tone…', 'translate-de': 'Translating to German…', 'translate-en': 'Translating to English…' };

  function showLoading(type) {
    buildOverlay(`
      <div class="fmw-header">
        <span class="fmw-title">FlowFluent</span>
        <button class="fmw-close" title="Close">&#x2715;</button>
      </div>
      <div class="fmw-body">
        <div class="fmw-loading">
          <div class="fmw-spinner"></div>
          <span>${LABELS[type] || 'Generating…'}</span>
        </div>
        <div class="fmw-stream-text" id="fmw-stream-text" style="display:none"></div>
      </div>
    `);
  }

  function updateStreamingText(partial) {
    if (!overlay) return;
    const loadingEl    = overlay.querySelector('.fmw-loading');
    const streamTextEl = overlay.querySelector('#fmw-stream-text');
    if (!streamTextEl) return;
    if (loadingEl) loadingEl.style.display = 'none';
    streamTextEl.style.display = '';
    streamTextEl.textContent   = partial;
    streamTextEl.scrollTop     = streamTextEl.scrollHeight;
  }

  // ---------- Overlay: result ----------

  const TONE_LABELS = { ceo: 'CEO', friendly: 'Friendlier', professional: 'Professional' };

  function showResult(inputText, outputText, type, tone) {
    const diffHtml = buildDiffHtml(inputText, outputText);

    const typeLabels = { fix: 'Suggested fix', shorten: 'Shortened', lengthen: 'Lengthened', 'translate-de': 'Translated to German', 'translate-en': 'Translated to English' };
    const typeLabel  = tone ? (TONE_LABELS[tone] + ' tone') : (typeLabels[type] || 'Result');

    buildOverlay(`
      <div class="fmw-header">
        <span class="fmw-title">FlowFluent</span>
        <button class="fmw-close" title="Close">&#x2715;</button>
      </div>
      <div class="fmw-body">
        <div class="fmw-label">${typeLabel}</div>
        <div class="fmw-fixed-text">${diffHtml}</div>
      </div>
      <div class="fmw-transforms">
        <div class="fmw-chip-row">
          <button class="fmw-chip${tone === 'ceo'          ? ' active' : ''}" data-tone="ceo">CEO</button>
          <button class="fmw-chip${tone === 'friendly'     ? ' active' : ''}" data-tone="friendly">Friendlier</button>
          <button class="fmw-chip${tone === 'professional' ? ' active' : ''}" data-tone="professional">Professional</button>
        </div>
        <div class="fmw-chip-row">
          <button class="fmw-chip" id="fmw-shorten">↓ Shorten</button>
          <button class="fmw-chip" id="fmw-lengthen">↑ Lengthen</button>
        </div>
        <div class="fmw-chip-row">
          <button class="fmw-chip${type === 'translate-de' ? ' active' : ''}" id="fmw-translate-de">🇩🇪 → German</button>
          <button class="fmw-chip${type === 'translate-en' ? ' active' : ''}" id="fmw-translate-en">🇬🇧 → English</button>
        </div>
      </div>
      <div class="fmw-footer">
        <div class="fmw-footer-left">
          <button class="fmw-btn fmw-btn-secondary" id="fmw-discard">Discard</button>
        </div>
        <div class="fmw-footer-right">
          <button class="fmw-btn fmw-btn-primary" id="fmw-accept">Replace</button>
        </div>
      </div>
    `);

    overlay.querySelector('#fmw-accept').addEventListener('click', () => {
      replaceText(outputText);
      removeOverlay();
    });
    overlay.querySelector('#fmw-discard').addEventListener('click', removeOverlay);
    overlay.querySelector('#fmw-shorten').addEventListener('click', () => runTransform(outputText, 'shorten', null));
    overlay.querySelector('#fmw-lengthen').addEventListener('click', () => runTransform(outputText, 'lengthen', null));
    overlay.querySelector('#fmw-translate-de').addEventListener('click', () => runTransform(outputText, 'translate-de', null));
    overlay.querySelector('#fmw-translate-en').addEventListener('click', () => runTransform(outputText, 'translate-en', null));
    overlay.querySelectorAll('.fmw-chip[data-tone]').forEach(btn => {
      btn.addEventListener('click', () => runTransform(outputText, 'tone', btn.dataset.tone));
    });
  }

  // ---------- Overlay: error ----------

  function showError(errorMsg) {
    buildOverlay(`
      <div class="fmw-header">
        <span class="fmw-title">FlowFluent</span>
        <button class="fmw-close" title="Close">&#x2715;</button>
      </div>
      <div class="fmw-body">
        <div class="fmw-error">
          <span class="fmw-error-icon">&#9888;</span>
          <span>${esc(errorMsg || 'An unknown error occurred.')}</span>
        </div>
      </div>
    `);
  }

  // ---------- DOM helpers ----------

  function buildOverlay(innerHTML) {
    removeOverlay();
    overlay = document.createElement('div');
    overlay.id = 'fmw-overlay';
    overlay.innerHTML = innerHTML;
    overlay.querySelector('.fmw-close')?.addEventListener('click', removeOverlay);
    document.body.appendChild(overlay);
    positionOverlay();
  }

  function removeOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function positionOverlay() {
    if (!overlay) return;
    overlay.style.top   = '12px';
    overlay.style.right = '12px';
    overlay.style.left  = '';
  }

  // ---------- Text replacement ----------

  function replaceText(newText) {
    if (savedInputState) {
      const { el, start, end } = savedInputState;
      savedInputState = null;
      el.focus();
      el.setSelectionRange(start, end);
      if (!document.execCommand('insertText', false, newText)) {
        el.value = el.value.slice(0, start) + newText + el.value.slice(end);
        el.setSelectionRange(start + newText.length, start + newText.length);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    if (savedRange) {
      const r        = savedRange;
      savedRange     = null;
      const anchor   = r.commonAncestorContainer;
      const editable = (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor)
                         ?.closest('[contenteditable="true"], [contenteditable=""]');
      if (editable) {
        editable.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('insertText', false, newText);
        return;
      }
      try {
        r.deleteContents();
        r.insertNode(document.createTextNode(newText));
        r.collapse(false);
        window.getSelection()?.removeAllRanges();
        return;
      } catch (_) {}
    }

    document.execCommand?.('insertText', false, newText);
  }

  // ---------- Settings ----------

  function getSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(
        { ollamaUrl: DEFAULT_OLLAMA_URL, model: DEFAULT_MODEL, style: DEFAULT_STYLE },
        result => chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(result)
      );
    });
  }

  // ---------- Inline word-level diff ----------

  function buildDiffHtml(original, fixed) {
    if (original === fixed) return esc(fixed);
    const ow = tokenize(original), fw = tokenize(fixed);
    const lcs = longestCommonSubsequence(ow, fw);
    let html = '', oi = 0, fi = 0, li = 0;
    while (fi < fw.length) {
      if (li < lcs.length && fw[fi] === lcs[li] && ow[oi] === lcs[li]) {
        html += esc(fw[fi]); oi++; fi++; li++;
      } else {
        html += `<mark class="fmw-diff-add">${esc(fw[fi])}</mark>`; fi++;
        while (oi < ow.length && (li >= lcs.length || ow[oi] !== lcs[li])) oi++;
      }
    }
    return html;
  }

  function tokenize(s) { return s.match(/\S+|\s+/g) || []; }

  function longestCommonSubsequence(a, b) {
    const m = a.length, n = b.length;
    if (m * n > 40000) return [];
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const r = []; let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i-1] === b[j-1]) { r.unshift(a[i-1]); i--; j--; }
      else if (dp[i-1][j] > dp[i][j-1]) i--;
      else j--;
    }
    return r;
  }

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
