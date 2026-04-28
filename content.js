// content.js — injected into every page
// Owns selection, text replacement, and the result overlay.

(function () {
  'use strict';

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
    if (message.action === 'replaceText')        replaceText(message.text);
  });

  // ---------- Core transform (streams through the background worker) ----------

  async function runTransform(inputText, type, tone) {
    showLoading(type);

    try {
      const outputText = await streamTransform(inputText, type, tone);
      if (outputText.trim()) {
        showResult(inputText, outputText.trim(), type, tone);
      } else {
        showError('Ollama returned an empty response. Is the selected model available?');
      }
    } catch (err) {
      showError(err.message);
    }
  }

  function streamTransform(inputText, type, tone) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const port = chrome.runtime.connect({ name: 'ollama-transform' });

      port.onMessage.addListener(message => {
        if (message.type === 'chunk') {
          updateStreamingText(message.text || '');
        }

        if (message.type === 'done') {
          settled = true;
          port.disconnect();
          resolve(message.text || '');
        }

        if (message.type === 'error') {
          settled = true;
          port.disconnect();
          reject(new Error(message.error || 'Ollama failed to transform the text.'));
        }
      });

      port.onDisconnect.addListener(() => {
        if (!settled) reject(new Error('FlowFluent lost the connection to the background worker.'));
      });

      port.postMessage({ action: 'start', text: inputText, type, tone });
    });
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
