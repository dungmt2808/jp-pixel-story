import { useEffect, useRef } from "react";
import { drawMinhPortrait } from "../engine/pixelRenderer";

interface PortraitCanvasProps {
  className?: string;
}

export function PortraitCanvas({ className }: PortraitCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawMinhPortrait(ctx);
  }, []);

  return (
    <canvas
      ref={ref}
      width={48}
      height={48}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        imageRendering: "pixelated",
      }}
    />
  );
}
