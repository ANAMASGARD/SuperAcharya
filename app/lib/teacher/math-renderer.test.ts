import { equationLatex, generatedEquation, matchesTeachingLine } from "@shared/teacher-math";
import { sceneFileIds, emptyScene } from "@shared/whiteboard";
import { expect, it } from "vitest";

import { renderEquation } from "./math-renderer";

it("typesets textbook fractions, roots, Greek symbols and powers into self-contained paths", () => {
  const result = renderEquation(
    String.raw`\sin\theta=\frac{1}{2},\quad x=\sqrt{3},\quad x^2`,
  );
  expect(result.width).toBeGreaterThan(50);
  expect(result.height).toBeGreaterThan(30);
  expect(result.markup).toContain("<path");
  expect(result.markup).not.toContain("<text");
  expect(result.markup).not.toMatch(/<script|href=|currentColor/);
});
it("rejects invalid TeX and external-content commands", () => {
  expect(() =>
    renderEquation(String.raw`\href{https://example.com}{x}`),
  ).toThrow("unsupported");
  expect(() => renderEquation(String.raw`\notARealMathCommand`)).toThrow(
    "typeset",
  );
});
it("regenerates only source-backed equations; ordinary images still require private storage", () => {
  const image = {
    id: "equation-1",
    type: "image" as const,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    fileId: "math_equation-1",
    customData: { equation: { version: 1, latex: String.raw`\frac{1}{2}` } },
  };
  expect(generatedEquation(image)?.latex).toBe(String.raw`\frac{1}{2}`);
  expect(matchesTeachingLine(image, String.raw`$$\frac{1}{2}$$`)).toBe(true);
  expect(matchesTeachingLine(image, "$$x=3$$")).toBe(false);
  expect(sceneFileIds({ ...emptyScene(), elements: [image] })).toEqual([]);
  expect(
    sceneFileIds({ ...emptyScene(), elements: [{ ...image, customData: {} }] }),
  ).toEqual([image.fileId]);
});


it("typesets mixed English labels and multiple inline formulas without raw delimiters", () => {
  const latex = equationLatex(String.raw`Let $$A=\theta$$ and $$B=\theta$$.`)!;
  expect(latex).not.toContain("$$");
  expect(latex).toContain(String.raw`\text{Let }`);
  expect(renderEquation(latex).markup).toContain("<path");
  expect(equationLatex(String.raw`$$\sin(2\theta)=2\sin\theta\cos\theta$$`)).toBe(String.raw`\sin(2\theta)=2\sin\theta\cos\theta`);
});
