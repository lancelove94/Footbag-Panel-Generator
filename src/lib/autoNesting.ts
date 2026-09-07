// Auto-nesting and common-line helpers for Footbag Panel Generator.
// Kept DOM-independent so the placement and edge logic can be tested/reused.

export interface NestPoint { x: number; y: number }
export interface NestPolygon { points: NestPoint[]; rotation?: number }
export interface Placement { x: number; y: number; rotation: number; points: NestPoint[] }
export interface NestOptions {
  count: number;
  sheetWidth: number;
  sheetHeight: number;
  margin?: number;
  gap?: number;
  rotations?: number[];
  step?: number;
}
export interface Segment { a: NestPoint; b: NestPoint }

const EPS = 1e-7;
const dist = (a: NestPoint, b: NestPoint) => Math.hypot(a.x-b.x, a.y-b.y);

function rotate(points: NestPoint[], degrees: number): NestPoint[] {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return points.map(p => ({ x: p.x*c-p.y*s, y: p.x*s+p.y*c }));
}
function bounds(points: NestPoint[]) {
  return {
    minX: Math.min(...points.map(p=>p.x)), minY: Math.min(...points.map(p=>p.y)),
    maxX: Math.max(...points.map(p=>p.x)), maxY: Math.max(...points.map(p=>p.y))
  };
}
function translate(points: NestPoint[], x:number, y:number) {
  return points.map(p=>({x:p.x+x,y:p.y+y}));
}
function orient(a:NestPoint,b:NestPoint,c:NestPoint) {
  return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
}
function onSegment(a:NestPoint,b:NestPoint,p:NestPoint) {
  return Math.abs(orient(a,b,p)) < EPS &&
    p.x >= Math.min(a.x,b.x)-EPS && p.x <= Math.max(a.x,b.x)+EPS &&
    p.y >= Math.min(a.y,b.y)-EPS && p.y <= Math.max(a.y,b.y)+EPS;
}
function segmentsCross(a:NestPoint,b:NestPoint,c:NestPoint,d:NestPoint) {
  const o1=orient(a,b,c), o2=orient(a,b,d), o3=orient(c,d,a), o4=orient(c,d,b);
  if (((o1>EPS&&o2<-EPS)||(o1<-EPS&&o2>EPS)) &&
      ((o3>EPS&&o4<-EPS)||(o3<-EPS&&o4>EPS))) return true;
  return false; // touching/collinear edges are intentionally allowed
}
function pointInPoly(p:NestPoint, poly:NestPoint[]) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i], b=poly[j];
    if(onSegment(a,b,p)) return false; // boundary touching is allowed
    if(((a.y>p.y)!=(b.y>p.y)) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function polygonsOverlap(a:NestPoint[], b:NestPoint[]) {
  for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++)
    if(segmentsCross(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length])) return true;
  return pointInPoly(a[0],b) || pointInPoly(b[0],a);
}
function minVertexDistance(a:NestPoint[], b:NestPoint[]) {
  let m=Infinity; for(const p of a) for(const q of b) m=Math.min(m,dist(p,q)); return m;
}

/**
 * Deterministic bottom-left nesting. It tries allowed rotations and scans upward
 * in small increments. It is heuristic (not a claim of global optimality).
 */
export function autoNestPolygon(base: NestPoint[], options: NestOptions): Placement[] {
  const margin=Math.max(0,options.margin??0), gap=Math.max(0,options.gap??0);
  const rotations=options.rotations?.length ? options.rotations : [0];
  const step=Math.max(.25,options.step??1);
  const placed:Placement[]=[];
  const variants=rotations.map(rotation=>{
    const pts=rotate(base,rotation), b=bounds(pts);
    return {rotation, pts:translate(pts,-b.minX,-b.minY), w:b.maxX-b.minX, h:b.maxY-b.minY};
  });
  for(let n=0;n<options.count;n++) {
    let best:Placement|undefined, bestScore=Infinity;
    for(const v of variants) {
      for(let y=margin;y+v.h<=options.sheetHeight-margin+EPS;y+=step) {
        for(let x=margin;x+v.w<=options.sheetWidth-margin+EPS;x+=step) {
          const pts=translate(v.pts,x,y);
          const collision=placed.some(p=>polygonsOverlap(pts,p.points) || (gap>0 && minVertexDistance(pts,p.points)<gap-EPS));
          if(collision) continue;
          const b=bounds(pts);
          const usedW=Math.max(b.maxX,...placed.flatMap(p=>p.points.map(q=>q.x)))-margin;
          const usedH=Math.max(b.maxY,...placed.flatMap(p=>p.points.map(q=>q.y)))-margin;
          const score=usedW*usedH + y*.01 + x*.001;
          if(score<bestScore){bestScore=score;best={x,y,rotation:v.rotation,points:pts};}
        }
      }
    }
    if(!best) break;
    placed.push(best);
  }
  return placed;
}

function canonical(s:Segment,tol:number) {
  const a=(s.a.x<s.b.x || (Math.abs(s.a.x-s.b.x)<=tol && s.a.y<=s.b.y))?s.a:s.b;
  const b=a===s.a?s.b:s.a;
  return {a,b};
}
function samePoint(a:NestPoint,b:NestPoint,t:number){return dist(a,b)<=t;}

/** Removes duplicate coincident straight segments, including reversed direction. */
export function uniqueCommonLineSegments(segments: Segment[], tolerance=.03): Segment[] {
  const out:Segment[]=[];
  outer: for(const raw of segments) {
    const s=canonical(raw,tolerance);
    for(const existing of out) {
      const e=canonical(existing,tolerance);
      if(samePoint(s.a,e.a,tolerance)&&samePoint(s.b,e.b,tolerance)) continue outer;
    }
    out.push(s);
  }
  return out;
}

export function polygonSegments(points:NestPoint[]):Segment[] {
  return points.map((p,i)=>({a:p,b:points[(i+1)%points.length]}));
}
