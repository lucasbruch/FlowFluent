// popup.js

(async () => {
  'use strict';

  // ---------- View helpers ----------

  const views = ['idle', 'ready', 'loading', 'result', 'error'];

  function show(name) {
    views.forEach(v => {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name);
    });
  }

  // ---------- State ----------

  let selectedText = '';
  let fixedText    = '';

  // ---------- On open: read selected text from the active tab ----------

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() ?? ''
      });
      selectedText = (result || '').trim();
    } catch (_) {
      // scripting may fail on chrome:// / extension pages — ignore
    }
  }

  if (selectedText) {
    document.getElementById('selected-preview').textContent = truncate(selectedText, 150);
    show('ready');
  } else {
    show('idle');
  }

  // ---------- Button: Fix this writing ----------

  document.getElementById('btn-fix').addEventListener('click', async () => {
    if (!selectedText) return;
    show('loading');

    const response = await chrome.runtime.sendMessage({
      action: 'fixTextForPopup',
      text: selectedText
    });

    if (response.success) {
      fixedText = response.fixed;
      document.getElementById('result-text').innerHTML = buildDiffHtml(selectedText, fixedText);
      show('result');
    } else {
      document.getElementById('error-msg').textContent = response.error || 'An unknown error occurred.';
      show('error');
    }
  });

  // ---------- Button: Accept ----------

  document.getElementById('btn-accept').addEventListener('click', async () => {
    if (!fixedText || !tab?.id) return;

    // Ask the content script to replace the text using the saved range.
    await chrome.tabs.sendMessage(tab.id, {
      action: 'replaceText',
      text: fixedText
    }).catch(() => {
      // If content script isn't available, fall back to execScript.
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text) => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            r.deleteContents();
            r.insertNode(document.createTextNode(text));
          }
        },
        args: [fixedText]
      });
    });

    window.close();
  });

  // ---------- Button: Discard ----------

  document.getElementById('btn-discard').addEventListener('click', () => {
    show('ready');
    fixedText = '';
  });

  // ---------- Button: Retry ----------

  document.getElementById('btn-retry').addEventListener('click', () => {
    show('ready');
  });

  // ---------- Settings link ----------

  document.getElementById('btn-options').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // ---------- Inline diff ----------

  function buildDiffHtml(original, fixed) {
    if (original === fixed) return esc(fixed);

    const origTokens  = tokenize(original);
    const fixedTokens = tokenize(fixed);
    const lcs         = longestCommonSubsequence(origTokens, fixedTokens);

    let html = '';
    let oi = 0, fi = 0, li = 0;

    while (oi < origTokens.length || fi < fixedTokens.length) {
      const inLcs           = li < lcs.length;
      const origMatchesLcs  = inLcs && oi < origTokens.length  && origTokens[oi]  === lcs[li];
      const fixedMatchesLcs = inLcs && fi < fixedTokens.length && fixedTokens[fi] === lcs[li];

      if (origMatchesLcs && fixedMatchesLcs) {
        html += esc(fixedTokens[fi]);
        oi++; fi++; li++;
      } else {
        while (oi < origTokens.length && !(li < lcs.length && origTokens[oi] === lcs[li])) {
          const tok = origTokens[oi++];
          html += /\S/.test(tok) ? `<del>${esc(tok)}</del>` : esc(tok);
        }
        while (fi < fixedTokens.length && !(li < lcs.length && fixedTokens[fi] === lcs[li])) {
          const tok = fixedTokens[fi++];
          html += /\S/.test(tok) ? `<ins>${esc(tok)}</ins>` : esc(tok);
        }
      }
    }

    return html;
  }

  function tokenize(str) { return str.match(/\S+|\s+/g) || []; }

  function longestCommonSubsequence(a, b) {
    const m = a.length, n = b.length;
    if (m * n > 40000) return [];
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const result = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i-1] === b[j-1]) { result.unshift(a[i-1]); i--; j--; }
      else if (dp[i-1][j] > dp[i][j-1]) i--;
      else j--;
    }
    return result;
  }

  function esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

})();
