// prompts.js — shared prompt builder

const DEFAULT_STYLE = 'easy';

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
