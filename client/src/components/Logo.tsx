import { useId } from "react";
import { WORD_MON, WORD_RIVAL } from "./logo-paths";

const INK = "#1b1147";
const RED = "#e5352b";
const BLUE = "#2563d9";
const YELLOW = "#ffcb05";

/** La bola del juego, de diseño propio: mitades azul y roja, con una banda amarilla en diagonal. Es decorativa. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <circle cx="32" cy="32" r="30" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M32 6.2a25.8 25.8 0 0 0 0 51.6z" fill={BLUE} />
      <path d="M32 6.2a25.8 25.8 0 0 1 0 51.6z" fill={RED} />
      <path d="M42.2 8.3 21.8 55.7" fill="none" stroke={YELLOW} strokeWidth="9" />
      <circle cx="32" cy="32" r="10.8" fill="#fff" stroke={INK} strokeWidth="3" />
    </svg>
  );
}

/** El logo a lo ancho, para el encabezado: «Rival» y «mon» frente a frente, con la bola en medio. */
function LogoWord({ className = "" }: { className?: string }) {
  const clip = useId();
  return (
    <svg data-logo-word viewBox="0 0 170 44" height="38" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <clipPath id={clip}>
        <rect width="170" height="44" rx="10" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="85" height="44" fill={RED} />
        <rect x="85" width="85" height="44" fill={BLUE} />
        <polygon points="84,0 96,0 86,44 74,44" fill={YELLOW} />
      </g>
      {[WORD_RIVAL, WORD_MON].map((d) => (
        <path key={d} d={d} fill="#fff" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke" />
      ))}
      <svg x="68" y="5" width="34" height="34" viewBox="0 0 64 64" overflow="visible">
        <circle cx="32" cy="32" r="30" fill="#fff" stroke={INK} strokeWidth="4" />
        <path d="M32 6.2a25.8 25.8 0 0 0 0 51.6z" fill={BLUE} />
        <path d="M32 6.2a25.8 25.8 0 0 1 0 51.6z" fill={RED} />
        <path d="M42.2 8.3 21.8 55.7" fill="none" stroke={YELLOW} strokeWidth="9" />
        <circle cx="32" cy="32" r="10.8" fill="#fff" stroke={INK} strokeWidth="4" />
      </svg>
    </svg>
  );
}

/**
 * El logo del encabezado. El nombre va también como texto oculto, que es lo que da nombre al enlace. En pantallas estrechas
 * puede quedar solo la bola (`hideNameOnMobile`), para que quepan los botones.
 */
export function Logo({ hideNameOnMobile = false }: { hideNameOnMobile?: boolean }) {
  return (
    <span className="inline-flex items-center">
      <span className="sr-only">Rivalmon</span>
      {hideNameOnMobile ? <LogoMark size={34} className="sm:hidden" /> : null}
      <LogoWord className={hideNameOnMobile ? "max-sm:hidden" : ""} />
    </span>
  );
}
