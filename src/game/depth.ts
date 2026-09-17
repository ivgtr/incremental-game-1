import type { DepthId } from './types';

export const DEPTH_ORDER: readonly DepthId[] = [
  'D-001',
  'D-030',
  'D-060',
  'D-100',
  'D-180',
  'D-250',
  'D-400',
  'D-650',
] as const;

export const DEPTH_VALUE: Readonly<Record<DepthId, number>> = {
  'D-001': 1,
  'D-030': 30,
  'D-060': 60,
  'D-100': 100,
  'D-180': 180,
  'D-250': 250,
  'D-400': 400,
  'D-650': 650,
};

export function depthRank(depth: DepthId): number {
  return DEPTH_ORDER.indexOf(depth);
}

export function depthDistance(a: DepthId, b: DepthId): number {
  return Math.abs(DEPTH_VALUE[a] - DEPTH_VALUE[b]);
}

export function deeperDepth(a: DepthId, b: DepthId): DepthId {
  return depthRank(a) >= depthRank(b) ? a : b;
}

export function isDepthAtLeast(depth: DepthId, target: DepthId): boolean {
  return depthRank(depth) >= depthRank(target);
}
