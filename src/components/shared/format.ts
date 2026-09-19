export function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatState(value: string): string {
  return value.replaceAll('_', ' ');
}

export function signal(value: number): string {
  return value >= 0.5 ? 'HIGH' : value >= 0.18 ? 'MED' : 'LOW';
}
