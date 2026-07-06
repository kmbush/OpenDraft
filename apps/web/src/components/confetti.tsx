/**
 * One-shot confetti burst, shared by the board and the draft-order reveal. Every
 * piece is derived from its index (position/size/shape are index-math, not random)
 * so a reconnect or re-render is idempotent — the burst never reshuffles mid-show.
 */
const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f8fafc'];

export function Confetti({ count = 120 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 12) * 0.13;
        const duration = 2.4 + ((i * 7) % 18) / 10;
        const size = 6 + ((i * 13) % 10);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative burst
            key={i}
            className="animate-confetti absolute top-0 block"
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 2 ? '9999px' : '2px',
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  );
}
