import { z } from "zod";

export const equationSourceSchema = z
  .object({
    version: z.literal(1),
    latex: z.string().trim().min(1).max(1000),
  })
  .strict();

export function equationLatex(line: string): string | null {
  const trimmed = line.trim();
  const display = trimmed.match(/^\\\[([\s\S]+)\\\]$/);
  if (display) return display[1]!.trim();
  const matches = [...trimmed.matchAll(/\$\$([\s\S]+?)\$\$/g)];
  if (!matches.length) return null;
  const escapes: Record<string, string> = { "\\": "\\textbackslash{}", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}" };
  const prose = (value: string) => value
    ? `\\text{${value.replace(/[\\{}%$&#_^~]/g, (char) => escapes[char] ?? `\\${char}`)}}`
    : "";
  let end = 0;
  let latex = "";
  for (const match of matches) {
    latex += prose(trimmed.slice(end, match.index)) + match[1]!.trim();
    end = match.index! + match[0].length;
  }
  return (latex + prose(trimmed.slice(end))).trim();
}

/** Generated formulas contain source, never trusted HTML, SVG or a remote URL. */
export function generatedEquation(element: {
  id: string;
  type: string;
  fileId?: string | null | undefined;
  customData?: unknown;
}) {
  if (element.type !== "image" || element.fileId !== `math_${element.id}`)
    return null;
  const metadata = z
    .object({ equation: equationSourceSchema })
    .safeParse(element.customData);
  return metadata.success ? metadata.data.equation : null;
}

export function matchesTeachingLine(
  element: {
    id: string;
    type: string;
    fileId?: string | null | undefined;
    customData?: unknown;
    originalText?: unknown;
  },
  line: string,
) {
  const latex = equationLatex(line);
  return latex
    ? generatedEquation(element)?.latex === latex
    : element.type === "text" && element.originalText === line;
}
