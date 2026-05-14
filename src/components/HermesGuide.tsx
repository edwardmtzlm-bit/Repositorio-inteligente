interface HermesGuideProps {
  active: boolean;
  phase: 'standby' | 'travel' | 'arrive';
  x: number;
  y: number;
}

export function HermesGuide({ active, phase, x, y }: HermesGuideProps) {
  if (!active) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-1/2 transition-[left,top,transform,opacity] duration-700 ease-out"
      style={{
        left: x,
        top: y,
        opacity: phase === 'standby' ? 0.92 : 1,
        transform: `translate(-50%, -50%) scale(${phase === 'standby' ? 0.9 : phase === 'travel' ? 1.04 : 1})`,
      }}
      aria-hidden="true"
    >
      <div className="hermes-flight relative">
        <video
          src="/hermes.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="h-28 w-28 rounded-2xl object-contain drop-shadow-[0_18px_22px_rgba(15,23,42,0.28)] sm:h-32 sm:w-32"
        />
        <span className="absolute bottom-3 left-1/2 h-2 w-14 -translate-x-1/2 rounded-full bg-amber-500/25 blur-[3px]" />
      </div>
    </div>
  );
}
