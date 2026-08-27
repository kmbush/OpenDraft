/**
 * One-shot confetti burst, shared by the board and the draft-order reveal.
 *
 * Every piece is derived from its index (see `lib/confetti`), so a reconnect or
 * re-render is idempotent — the burst never reshuffles mid-show.
 *
 * Each piece is three nested transforms, not one: an outer element travels, a
 * middle one flutters sideways, an inner one tumbles on three axes. They need
 * separate elements because they run at different periods — a piece travels once
 * but flutters several times and tumbles at its own rate per axis. Folding them
 * together is what made the old burst read as one rigid object per piece.
 *
 * Nothing here animates layout or colour, so the whole burst composites.
 */
import { type ConfettiVariant, confettiPiece } from '../lib/confetti.js';

export function Confetti({
  count = 120,
  variant = 'cannon',
  colors,
}: {
  count?: number;
  variant?: ConfettiVariant;
  /** Team colours for a themed burst; omit for the house palette. */
  colors?: readonly string[];
}) {
  // A cannon fires once. A drift is ambient and has to keep going, because the
  // screen it sits on stays up for the rest of the night.
  const loops = variant === 'fall';

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
      // Depth needs a shared perspective, or the tumble flattens into a scale.
      style={{ perspective: '900px' }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => {
        const p = confettiPiece(i, variant, colors);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, index-derived burst
            key={i}
            className="absolute animate-(--animate-confetti-travel)"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              opacity: p.opacity,
              filter: p.blur ? `blur(${p.blur}px)` : undefined,
              animationDuration: `${p.durationS}s`,
              animationDelay: `${p.delayS}s`,
              animationIterationCount: loops ? 'infinite' : undefined,
              // Read by the travel keyframe.
              ['--dx' as string]: `${p.dx}vw`,
              ['--dy' as string]: `${p.dy}vh`,
              ['--apex-x' as string]: `${p.apexX}vw`,
              ['--apex-y' as string]: `${p.apexY}vh`,
            }}
          >
            <span
              className="block animate-[confetti-flutter_infinite_alternate_ease-in-out]"
              style={{
                animationDuration: `${p.swayS}s`,
                ['--sway' as string]: `${p.swayPx}px`,
              }}
            >
              <span
                className="block animate-[confetti-spin-x_infinite_linear]"
                style={{ animationDuration: `${p.spinXS}s`, transformStyle: 'preserve-3d' }}
              >
                <span
                  className="block animate-[confetti-spin-y_infinite_linear]"
                  style={{ animationDuration: `${p.spinYS}s`, transformStyle: 'preserve-3d' }}
                >
                  <span
                    className="block animate-[confetti-spin-z_infinite_linear]"
                    style={{
                      animationDuration: `${p.spinZS}s`,
                      width: p.w,
                      height: p.h,
                      backgroundColor: p.color,
                      // Ribbons read as curled paper; discs stay round; rects are plain stock.
                      borderRadius:
                        p.shape === 'disc'
                          ? '9999px'
                          : p.shape === 'ribbon'
                            ? '40% 40% 6% 6%'
                            : '1px',
                    }}
                  />
                </span>
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
