/** Dégradé partagé par les icônes Lucide (classe .wa-neon-icon). À rendre une fois par page. */
export default function IconGradientDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="wa-icon-gradient" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0.15" stopColor="#FF6B00" />
          <stop offset="0.9" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  );
}
