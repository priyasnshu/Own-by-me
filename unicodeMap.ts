const BACKSLASH = String.fromCharCode(92);
const COMMAND_PREFIX = `${BACKSLASH}${BACKSLASH}`;

const greekMap: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', Theta: 'Θ', iota: 'ι', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', Xi: 'Ξ', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', Phi: 'Φ', chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω'
};

const operatorMap: Record<string, string> = {
  pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', approx: '≈',
  times: '×', cdot: '·', div: '÷', infinity: '∞', infty: '∞', int: '∫', sum: '∑',
  prod: '∏', partial: '∂', nabla: '∇', to: '→', rightarrow: '→', leftarrow: '←',
  iff: '⇔', degree: '°'
};

const superMap: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ', 'k': 'ᵏ',
  'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'z': 'ᶻ'
};

const subMap: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
};

function replaceCommandWords(text: string): string {
  const commandPattern = new RegExp(`${COMMAND_PREFIX}([A-Za-z]+)`, 'g');
  return text.replace(commandPattern, (full, command: string) => greekMap[command] ?? operatorMap[command] ?? full);
}

function toUnicodeSuperscript(value: string): string {
  return [...value].map((char) => superMap[char] ?? char).join('');
}

function toUnicodeSubscript(value: string): string {
  return [...value].map((char) => subMap[char] ?? char).join('');
}

function protectUrls(input: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  const text = input.replace(/https?:\/\/[^\s]+/g, (url) => {
    const token = `§§URL${urls.length}§§`;
    urls.push(url);
    return token;
  });
  return { text, urls };
}

function restoreUrls(input: string, urls: string[]): string {
  return input.replace(/§§URL(\d+)§§/g, (_full, index: string) => urls[Number(index)] ?? _full);
}

export function toUnicodeMath(input: string): string {
  if (!input) return input;
  const protectedInput = protectUrls(input.replace(/\r\n/g, '\n'));
  let text = protectedInput.text;

  const fracPattern = new RegExp(`${COMMAND_PREFIX}frac\\{([^{}]*)\\}\\{([^{}]*)\\}`, 'g');
  text = text.replace(fracPattern, (_full, numerator: string, denominator: string) => `(${numerator.trim()} / ${denominator.trim()})`);

  const sqrtPattern = new RegExp(`${COMMAND_PREFIX}sqrt\\{([^{}]*)\\}`, 'g');
  text = text.replace(sqrtPattern, (_full, radicand: string) => `√(${radicand.trim()})`);
  text = replaceCommandWords(text);

  text = text.replace(/([A-Za-z0-9α-ωΑ-Ω]+)\^\{([^{}]+)\}/g, (_full, base: string, exponent: string) => `${base}${toUnicodeSuperscript(exponent)}`);
  text = text.replace(/([A-Za-z0-9α-ωΑ-Ω]+)\^([A-Za-z0-9+\-]+)/g, (_full, base: string, exponent: string) => `${base}${toUnicodeSuperscript(exponent)}`);
  text = text.replace(/([A-Za-zα-ωΑ-Ω]+)_\{([^{}]+)\}/g, (_full, base: string, index: string) => `${base}${toUnicodeSubscript(index)}`);
  text = text.replace(/([A-Za-zα-ωΑ-Ω]+)_([0-9A-Za-z]+)/g, (_full, base: string, index: string) => `${base}${toUnicodeSubscript(index)}`);

  const token = '[A-Za-z0-9α-ωΑ-ΩπθΔμ∞]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]+)?';
  const fractionPattern = new RegExp(`(?<![A-Za-z0-9_/(])(${token})\\s*/\\s*(${token})(?![A-Za-z0-9_)])`, 'g');
  text = text.replace(fractionPattern, (_full, numerator: string, denominator: string) => `(${numerator} / ${denominator})`);

  text = text.replace(/<=/g, '≤').replace(/>=/g, '≥');

  text = text.replace(/\s{2,}/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  return restoreUrls(text.trim(), protectedInput.urls);
}
