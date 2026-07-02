const PREFIX = '[pingo-wa-sync]';

export function debugLog(...args: readonly unknown[]): void {
  console.log(PREFIX, ...args);
}
