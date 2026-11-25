/**
 * Ordered Bayer 4x4 dithering curtain transition for crisp retro scene dissolves.
 * Works directly on the 320x200 virtual pixel canvas.
 */

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Draws a Bayer ordered dither veil over the virtual canvas.
 * @param ctx 2D canvas context (320x200 virtual pixel space)
 * @param amount 0 = transparent, 1 = fully opaque dark ink
 * @param color Fill color for dithered pixels
 * @param cellSize Pixel block size (default 2 for authentic retro chunkiness)
 */
export function drawBayerDitherOverlay(
  ctx: CanvasRenderingContext2D,
  amount: number,
  color = "#0b0e1a",
  cellSize = 2
): void {
  if (amount <= 0.01) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  if (amount >= 0.99) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const threshold = amount * 16;
  ctx.fillStyle = color;
  for (let y = 0; y < h; y += cellSize) {
    const by = (y / cellSize) & 3;
    for (let x = 0; x < w; x += cellSize) {
      const bx = (x / cellSize) & 3;
      if (BAYER_4X4[by][bx] < threshold) {
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
}
