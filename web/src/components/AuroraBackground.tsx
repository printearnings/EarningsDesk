/**
 * A slow, soft glow instead of a repeating pattern — after two pattern-based
 * attempts (a hand-drawn price-line texture, then a flickering dot grid)
 * both read as too busy for a hero on a serious data product, this goes the
 * other direction: three large, heavily blurred radial gradients drifting
 * behind the content at low opacity, closer to "quiet ambient light" than
 * "decoration." No canvas, no JS — three divs and a CSS keyframe each,
 * cheap enough to not need a client component. Frozen to their resting
 * position under `prefers-reduced-motion` by the app-wide rule in
 * globals.css, same as every other animation here.
 */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-blob aurora-blob-c" />
    </div>
  );
}
