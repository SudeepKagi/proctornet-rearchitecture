/**
 * @file cn.js
 * @description Lightweight classnames merger for shadcn/ui components.
 */

export function cn(...inputs) {
  return inputs
    .flat(Infinity)
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .join(' ');
}
