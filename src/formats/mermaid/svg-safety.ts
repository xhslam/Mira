export const DANGEROUS_SVG_TAGS = Object.freeze([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "label",
  "fieldset",
  "link",
  "meta",
  "base",
  "noscript",
  "template",
  "slot",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "math",
] as const);

export const FORBIDDEN_SVG_ATTRS = Object.freeze([
  "onerror",
  "onload",
  "onclick",
  "onmouseover",
  "onmouseout",
  "onmousedown",
  "onmouseup",
  "onfocus",
  "onblur",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onchange",
  "onsubmit",
  "onreset",
  "onabort",
  "oncopy",
  "oncut",
  "onpaste",
  "xlink:href",
  "href",
] as const);

export const ALLOWED_SVG_ATTRS = Object.freeze([
  "style",
  "fill",
  "stroke",
  "stroke-width",
  "class",
  "transform",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "width",
  "height",
  "viewBox",
  "xmlns",
  "xmlns:xlink",
  "marker-end",
  "marker-start",
  "points",
  "pathLength",
  "id",
  "data-id",
  "aria-label",
  "role",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "fill-opacity",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
] as const);

export type SvgStyleSanitizeResult = Readonly<{
  sanitized: string;
  blocked: boolean;
}>;

const DANGEROUS_STYLE_PATTERNS: readonly RegExp[] = Object.freeze([
  /expression\s*\(/i,
  /javascript\s*:/i,
  /-moz-binding/i,
  /url\s*\(\s*["']?\s*javascript\s*:/i,
  /@import/i,
  /behavior\s*:/i,
]);

export function sanitizeSvgStyleValue(value: string): SvgStyleSanitizeResult {
  let blocked = false;
  let sanitized = value;
  for (const pattern of DANGEROUS_STYLE_PATTERNS) {
    if (pattern.test(sanitized)) {
      blocked = true;
      sanitized = sanitized.replace(pattern, "blocked");
    }
  }
  return Object.freeze({ sanitized, blocked });
}

export function hasForbiddenSvgTag(svg: string): boolean {
  const lower = svg.toLowerCase();
  return DANGEROUS_SVG_TAGS.some((tag) => {
    const pattern = new RegExp(`<\\s*${tag}(?:\\s|>|/)`, "i");
    return pattern.test(lower);
  });
}

export function hasForbiddenSvgAttr(svg: string): boolean {
  const lower = svg.toLowerCase();
  return FORBIDDEN_SVG_ATTRS.some((attr) => {
    const pattern = new RegExp(`${attr}\\s*=`, "i");
    return pattern.test(lower);
  });
}

export function checkSvgSafety(svg: string): SvgStyleSanitizeResult & { dangerous: boolean } {
  const styleResult = sanitizeSvgStyleValue(svg);
  const dangerous = hasForbiddenSvgTag(svg) || hasForbiddenSvgAttr(svg);
  return Object.freeze({ ...styleResult, dangerous });
}
