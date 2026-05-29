/* Small math/geometry helpers shared across the engine. */
import { view } from "./view.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));

// Toroidal screen wrap: an object that leaves one edge reappears on the other,
// using its radius so it slides fully off before wrapping.
export function wrap(o) {
  const { W, H } = view;
  if (o.x < -o.r) o.x = W + o.r;
  else if (o.x > W + o.r) o.x = -o.r;
  if (o.y < -o.r) o.y = H + o.r;
  else if (o.y > H + o.r) o.y = -o.r;
}
