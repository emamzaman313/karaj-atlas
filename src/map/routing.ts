import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { MOTAHARI_VIEW } from './motahari-focus';

type RoadProps = Record<string, unknown> & { highway?: string; name?: string; 'name:fa'?: string };
type RoadFeature = Feature<Geometry, RoadProps>;
type Point = [number, number];
type Link = { to: string; meters: number; cost: number; name: string };
type Network = { nodes: Map<string, Point>; links: Map<string, Link[]> };
export type WalkingRoute = { feature: Feature<LineString, { name: string }>; meters: number; minutes: number; roads: string[] };

const allowedRoads = new Set(['footway', 'path', 'pedestrian', 'steps', 'living_street', 'residential', 'service', 'tertiary', 'secondary', 'primary', 'unclassified', 'cycleway', 'track', 'crossing']);
const nodeKey = ([lng, lat]: Point): string => `${lng.toFixed(5)},${lat.toFixed(5)}`;
function distanceMeters(a: Point, b: Point): number {
  const rad = Math.PI / 180, lat1 = a[1] * rad, lat2 = b[1] * rad;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function inside([lng, lat]: Point): boolean {
  return lng >= MOTAHARI_VIEW.west && lng <= MOTAHARI_VIEW.east && lat >= MOTAHARI_VIEW.south && lat <= MOTAHARI_VIEW.north;
}
function lineParts(geometry: Geometry): Point[][] {
  if (geometry.type === 'LineString') return [geometry.coordinates as Point[]];
  if (geometry.type === 'MultiLineString') return geometry.coordinates as Point[][];
  return [];
}

export function buildWalkingNetwork(data: FeatureCollection<Geometry, Record<string, unknown>>): Network {
  const nodes = new Map<string, Point>(), links = new Map<string, Link[]>();
  const connect = (a: Point, b: Point, name: string, highway: string): void => {
    if (!inside(a) || !inside(b)) return;
    const from = nodeKey(a), to = nodeKey(b), meters = distanceMeters(a, b);
    if (from === to || meters < 0.5 || meters > 1500) return;
    const walkFactor = highway === 'pedestrian' ? .9 : highway === 'footway' || highway === 'path' ? .94 : highway === 'steps' ? 1.35 : highway === 'primary' ? 1.2 : highway === 'secondary' ? 1.1 : 1;
    nodes.set(from, nodes.get(from) || a); nodes.set(to, nodes.get(to) || b);
    const left = links.get(from) || []; left.push({ to, meters, cost: meters * walkFactor, name }); links.set(from, left);
    const right = links.get(to) || []; right.push({ to: from, meters, cost: meters * walkFactor, name }); links.set(to, right);
  };
  for (const raw of data.features) {
    const feature = raw as RoadFeature;
    if (!feature.properties?.highway || !allowedRoads.has(String(feature.properties.highway))) continue;
    const name = String(feature.properties['name:fa'] || feature.properties.name || 'گذر بی‌نام');
    for (const part of lineParts(feature.geometry)) for (let i = 1; i < part.length; i++) connect(part[i - 1], part[i], name, String(feature.properties.highway));
  }
  return { nodes, links };
}

class MinHeap {
  private items: { key: string; score: number }[] = [];
  push(item: { key: string; score: number }): void {
    this.items.push(item); let index = this.items.length - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (this.items[parent].score <= item.score) break; this.items[index] = this.items[parent]; index = parent; }
    this.items[index] = item;
  }
  pop(): { key: string; score: number } | undefined {
    if (!this.items.length) return undefined;
    const root = this.items[0], last = this.items.pop()!;
    if (this.items.length) {
      let index = 0;
      while (true) { let child = index * 2 + 1; if (child >= this.items.length) break; if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score) child++;
        if (this.items[child].score >= last.score) break; this.items[index] = this.items[child]; index = child; }
      this.items[index] = last;
    }
    return root;
  }
}

export function findWalkingRoute(network: Network, start: Point, end: Point): WalkingRoute | null {
  let startKey = '', endKey = '', startGap = Infinity, endGap = Infinity;
  for (const [key, point] of network.nodes) {
    const fromStart = distanceMeters(start, point), fromEnd = distanceMeters(end, point);
    if (fromStart < startGap) { startGap = fromStart; startKey = key; }
    if (fromEnd < endGap) { endGap = fromEnd; endKey = key; }
  }
  if (!startKey || !endKey || startGap > 300 || endGap > 300) return null;
  const distances = new Map<string, number>([[startKey, 0]]), previous = new Map<string, { key: string; link: Link }>(), heap = new MinHeap();
  heap.push({ key: startKey, score: 0 });
  while (true) {
    const current = heap.pop(); if (!current) break;
    if (current.score !== distances.get(current.key)) continue;
    if (current.key === endKey) break;
    for (const link of network.links.get(current.key) || []) {
      const nextDistance = current.score + link.cost;
      if (nextDistance >= (distances.get(link.to) ?? Infinity)) continue;
      distances.set(link.to, nextDistance); previous.set(link.to, { key: current.key, link }); heap.push({ key: link.to, score: nextDistance });
    }
  }
  if (distances.get(endKey) === undefined) return null;
  const keys = [endKey], roads: string[] = [], pathLinks:Link[]=[];
  let cursor = endKey;
  while (cursor !== startKey) {
    const step = previous.get(cursor); if (!step) return null;
    pathLinks.push(step.link);
    if (step.link.name !== 'گذر بی‌نام' && roads[roads.length - 1] !== step.link.name) roads.push(step.link.name);
    cursor = step.key; keys.push(cursor);
  }
  keys.reverse(); roads.reverse();
  // Include the final approach from the clicked coordinates to the nearest
  // routable nodes; otherwise the displayed route understates its length.
  const meters=pathLinks.reduce((total,link)=>total+link.meters,0)+startGap+endGap;
  const coordinates = [start, ...keys.map(key => network.nodes.get(key)!), end];
  return {
    feature: { type: 'Feature', properties: { name: 'مسیر پیادهٔ پیشنهادی' }, geometry: { type: 'LineString', coordinates } },
    meters, minutes: Math.max(1, Math.round(meters / 78)), roads
  };
}

export function measureMeters(start: Point, end: Point): number { return distanceMeters(start, end); }
