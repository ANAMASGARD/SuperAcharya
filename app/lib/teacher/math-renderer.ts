import { equationSourceSchema } from "@shared/teacher-math";
import { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import { SVG } from "mathjax-full/js/output/svg.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document("", {
  InputJax: new TeX({
    packages: ["base", "ams"],
    maxBuffer: 2000,
    maxMacros: 1000,
  }),
  OutputJax: new SVG({ fontCache: "none" }),
});

/** Bundled fonts become paths; no remote fonts, HTML extensions, or user SVG. */
export function renderEquation(latex: string) {
  equationSourceSchema.parse({ version: 1, latex });
  if (
    /\\(?:href|url|html\w*|includegraphics|require|def|gdef|newcommand|renewcommand|style|class|cssId)\b/.test(
      latex,
    )
  )
    throw new Error("This equation uses unsupported formatting commands.");
  const node = document.convert(latex, { display: true });
  const svg = adaptor.firstChild(node);
  if (!(svg instanceof LiteElement))
    throw new Error("Equation SVG is missing.");
  let markup = adaptor.outerHTML(svg);
  if (markup.includes('data-mml-node="merror"'))
    throw new Error(
      "The equation could not be typeset. Ask Acharya to restate it.",
    );
  const viewBox = adaptor
    .getAttribute(svg, "viewBox")
    ?.split(/\s+/)
    .map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite))
    throw new Error("Invalid equation dimensions.");
  const width = (viewBox[2]! * 32) / 1000;
  const height = (viewBox[3]! * 32) / 1000;
  if (width <= 0 || height <= 0 || width > 5000 || height > 2000)
    throw new Error("The equation is too large. Use shorter teaching steps.");
  markup = markup
    .replace(/width="[^"]*"/, `width="${width}"`)
    .replace(/height="[^"]*"/, `height="${height}"`)
    .replace(/currentColor/g, "#111111");
  return { markup, width, height };
}
