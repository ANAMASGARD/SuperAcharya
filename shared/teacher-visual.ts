import { z } from "zod";

/** Reviewed templates only: parameters are data, never expressions or code. */
export const visualSpecSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["right-triangle", "unit-circle", "sine-cosine", "parabola", "ellipse", "hyperbola"]),
  angleDegrees: z.number().finite().min(5).max(85),
}).strict();
export type VisualSpec = z.infer<typeof visualSpecSchema>;
type Point = [number, number];
export type VisualPart = { key: string; type: "line"; x: number; y: number; points: Point[] } | { key: string; type: "text"; x: number; y: number; text: string };

export function visualParts(raw: VisualSpec): VisualPart[] {
  const spec = visualSpecSchema.parse(raw);
  const parts: VisualPart[] = [];
  const line = (key: string, points: Point[]) => {
    const [x, y] = points[0]!;
    parts.push({ key, type: "line", x, y, points: points.map(([px, py]) => [px - x, py - y]) });
  };
  const text = (key: string, x: number, y: number, value: string) => parts.push({ key, type: "text", x, y, text: value });
  const theta = spec.angleDegrees * Math.PI / 180;
  if (spec.kind === "right-triangle") {
    const a = 280 * Math.cos(theta), b = 280 * Math.sin(theta);
    line("adjacent", [[40,300],[40+a,300]]);
    line("opposite", [[40+a,300],[40+a,300-b]]);
    line("hypotenuse", [[40,300],[40+a,300-b]]);
    line("right-angle", [[28+a,300],[28+a,288],[40+a,288]]);
    line("angle", Array.from({length:17}, (_, i): Point => [40+38*Math.cos(theta*i/16),300-38*Math.sin(theta*i/16)]));
    text("angle-label", 82, 270, `θ = ${spec.angleDegrees}°`);
    text("adjacent-label", 40+a/2-35, 315, "Adjacent");
    text("opposite-label", 52+a, 295-b/2, "Opposite");
    text("hypotenuse-label", Math.max(0, a/2-45), 270-b/2, "Hypotenuse");
    return parts;
  }
  const origin: Point = [220,200];
  const map = (x: number, y: number): Point => [origin[0]+x*75,origin[1]-y*75];
  line("x-axis", [map(-2.5,0),map(2.5,0)]);
  line("y-axis", [map(0,-2),map(0,2)]);
  text("x-label", 414,205,"x"); text("y-label",225,30,"y");
  const curve = (key: string, fn: (t: number) => Point, start: number, end: number) => line(key, Array.from({length:121},(_,i)=>fn(start+(end-start)*i/120)));
  if (spec.kind === "unit-circle") {
    curve("circle", t=>map(Math.cos(t),Math.sin(t)),0,2*Math.PI);
    line("radius", [map(0,0),map(Math.cos(theta),Math.sin(theta))]);
    line("sine", [map(Math.cos(theta),0),map(Math.cos(theta),Math.sin(theta))]);
    text("angle-label",240,215,`θ = ${spec.angleDegrees}°`);
    text("projection-label",40,365,`cos θ = ${Math.cos(theta).toFixed(3)}; sin θ = ${Math.sin(theta).toFixed(3)}`);
  } else if(spec.kind === "sine-cosine") {
    curve("sine", t=>map(t,Math.sin(t)), -2.5,2.5);
    curve("cosine", t=>map(t,Math.cos(t)), -2.5,2.5);
    text("legend",40,365,"y = sin x (blue); y = cos x (red). x in radians.");
  } else if(spec.kind === "parabola") {
    curve("parabola", t=>map(t,t*t),-1.4,1.4);
    text("equation",40,365,"y = x²");
  } else if(spec.kind === "ellipse") {
    curve("ellipse",t=>map(2*Math.cos(t),Math.sin(t)),0,2*Math.PI);
    text("equation",40,365,"x²/4 + y² = 1");
  } else {
    curve("right-branch",t=>map(Math.cosh(t),Math.sinh(t)),-1.4,1.4);
    curve("left-branch",t=>map(-Math.cosh(t),Math.sinh(t)),-1.4,1.4);
    text("equation",40,365,"x² − y² = 1");
  }
  return parts;
}

export function matchesVisualPart(element: { type: string; width?: unknown; height?: unknown; points?: unknown; originalText?: unknown; customData?: unknown }, part: VisualPart, spec: VisualSpec) {
  const metadata = z.object({ teacherVisual: visualSpecSchema, component: z.string() }).safeParse(element.customData);
  if (!metadata.success || metadata.data.teacherVisual.version !== spec.version || metadata.data.teacherVisual.kind !== spec.kind || metadata.data.teacherVisual.angleDegrees !== spec.angleDegrees || metadata.data.component !== part.key || element.type !== part.type) return false;
  if (part.type === "text") return element.originalText === part.text;
  const xs = part.points.map(p=>p[0]), ys = part.points.map(p=>p[1]);
  return JSON.stringify(element.points) === JSON.stringify(part.points) && element.width === Math.max(...xs)-Math.min(...xs) && element.height === Math.max(...ys)-Math.min(...ys);
}
