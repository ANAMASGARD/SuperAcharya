import { describe, expect, it } from "vitest";
import { matchesVisualPart, visualParts, visualSpecSchema } from "./teacher-visual";
import { z } from "zod";
import { teachingElementCount, teachingStepSchema, teachingLineSchema } from "./teacher-board";

describe("reviewed visual geometry", () => {
  it("derives right triangle sides from a single reference angle", () => {
    const spec = visualSpecSchema.parse({ version: 1, kind: "right-triangle", angleDegrees: 30 });
    const parts = visualParts(spec);
    const hypotenuse = parts.find(p=>p.key === "hypotenuse")!;
    expect(hypotenuse.type).toBe("line");
    if(hypotenuse.type !== "line") throw new Error("Missing line");
    const [x,y] = hypotenuse.points[1]!;
    expect(Math.hypot(x,y)).toBeCloseTo(280);
    expect(-y/280).toBeCloseTo(0.5);
    expect(x/280).toBeCloseTo(Math.sqrt(3)/2);
    const element = { type: "line", points: hypotenuse.points, width:x, height:-y, customData: {teacherVisual: spec, component: "hypotenuse"} };
    expect(matchesVisualPart(element,hypotenuse,spec)).toBe(true);
    expect(matchesVisualPart({...element,width:x+1},hypotenuse,spec)).toBe(false);
  });
  it("keeps hyperbola branches separate and all samples finite", () => {
    const parts = visualParts({version:1,kind:"hyperbola",angleDegrees:30});
    expect(parts.filter(p=>p.key.includes("branch"))).toHaveLength(2);
    for(const part of parts) if(part.type === "line") for(const point of part.points) expect(point.every(Number.isFinite)).toBe(true);
  });
  it("rejects executable or invalid model data", () => {
    expect(visualSpecSchema.safeParse({version:1,kind:"right-triangle",angleDegrees:NaN}).success).toBe(false);
    expect(visualSpecSchema.safeParse({version:1,kind:"right-triangle",angleDegrees:30,code:"alert(1)"}).success).toBe(false);
  });
  it("keeps old steps valid and allocates all visual component IDs", () => {
    const plain = teachingStepSchema.parse({heading:"",lines:["x = 3"],narration:"Simplify"});
    expect(teachingElementCount(plain)).toBe(1);
    const visual = {...plain, visual: visualSpecSchema.parse({version:1,kind:"right-triangle",angleDegrees:30})};
    expect(teachingElementCount(visual)).toBe(1+visualParts(visual.visual).length);
  });
});

it("requires every model-output field for OpenAI strict JSON while retaining old saved steps", () => {
  const schema = z.toJSONSchema(teachingLineSchema);
  expect(schema.required?.slice().sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
  expect(teachingLineSchema.safeParse({heading:"",line:"x = 3",narration:"Simplify",visual:null}).success).toBe(true);
  expect(teachingStepSchema.safeParse({heading:"",lines:["x = 3"],narration:"Simplify"}).success).toBe(true);
});
