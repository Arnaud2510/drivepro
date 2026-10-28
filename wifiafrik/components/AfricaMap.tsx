"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AFRICA_BORDERS,
  AFRICA_OUTLINE,
  AFRICA_VIEWBOX,
  CIRCUIT_STUBS,
  CIRCUIT_TRACES,
  MAP_NODES,
  type MapNode,
} from "./africa-geometry";

/** Villes mises en avant (couverture principale) : nœuds plus lumineux et pulsants. */
const HIGHLIGHTED = new Set(["dakar", "abidjan", "casablanca", "douala", "tunis", "bamako"]);

/** Liaisons « réseau » hors du continent : [idNœud, xExterne, yExterne]. */
const CONSTELLATION: readonly (readonly [string, number, number])[] = [
  ["dakar", -12, 152],
  ["nouakchott", -6, 104],
  ["casablanca", 34, 14],
  ["abidjan", 72, 214],
  ["douala", 128, 226],
  ["luanda", 150, 286],
  ["capetown", 176, 414],
  ["tunis", 194, 2],
  ["cairo", 312, 28],
  ["addis", 372, 146],
  ["mogadishu", 392, 232],
  ["maputo", 326, 392],
];

/** Liaison sans fil continent ↔ Madagascar. */
const WIRELESS: readonly (readonly [string, string])[] = [
  ["maputo", "antananarivo"],
  ["dodoma", "antananarivo"],
];

/** Traces parcourues par une impulsion lumineuse (indices dans CIRCUIT_TRACES). */
const FLOW_TRACES: readonly number[] = [0, 4, 6, 12, 15, 19, 24, 27, 31];

const PAD_X = 24;
const PAD_Y = 16;
const VIEWBOX = `${-PAD_X} ${-PAD_Y} ${AFRICA_VIEWBOX.width + PAD_X * 2} ${AFRICA_VIEWBOX.height + PAD_Y * 2}`;

const NODE_BY_ID: ReadonlyMap<string, MapNode> = new Map(MAP_NODES.map((n) => [n.id, n]));

function node(id: string): MapNode {
  const n = NODE_BY_ID.get(id);
  if (!n) throw new Error(`Nœud de carte inconnu : ${id}`);
  return n;
}

export default function AfricaMap() {
  const reduceMotion = useReducedMotion();
  const { width: W, height: H } = AFRICA_VIEWBOX;

  return (
    <motion.div
      className="relative mx-auto w-full max-w-[22rem] sm:max-w-[24rem]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg
        viewBox={VIEWBOX}
        className="block h-auto w-full"
        role="img"
        aria-label="Carte de l'Afrique en réseau lumineux orange et bleu"
        shapeRendering="geometricPrecision"
      >
        <defs>
          {/* Orange au nord-ouest, bleu à l'est, retour orangé à la pointe sud. */}
          <linearGradient id="wa-map-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
            <stop offset="0" stopColor="#FF6B00" />
            <stop offset="0.38" stopColor="#FF6B00" />
            <stop offset="0.62" stopColor="#2563EB" />
            <stop offset="0.86" stopColor="#3B6FF0" />
            <stop offset="1" stopColor="#FF6B00" />
          </linearGradient>

          <radialGradient id="wa-map-fill-orange" gradientUnits="userSpaceOnUse" cx={W * 0.18} cy={H * 0.12} r={W * 0.55}>
            <stop offset="0" stopColor="#FF6B00" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#FF6B00" stopOpacity="0.12" />
            <stop offset="1" stopColor="#FF6B00" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="wa-map-fill-blue" gradientUnits="userSpaceOnUse" cx={W * 0.78} cy={H * 0.45} r={W * 0.5}>
            <stop offset="0" stopColor="#2563EB" stopOpacity="0.22" />
            <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
          </radialGradient>

          <filter id="wa-glow-strong" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur-wide" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur-tight" />
            <feMerge>
              <feMergeNode in="blur-wide" />
              <feMergeNode in="blur-tight" />
            </feMerge>
          </filter>

          <filter id="wa-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <clipPath id="wa-map-clip">
            <path d={AFRICA_OUTLINE} />
          </clipPath>
        </defs>

        {/* Remplissage : halos internes discrets, sans fond opaque. */}
        <path d={AFRICA_OUTLINE} fill="url(#wa-map-fill-orange)" />
        <path d={AFRICA_OUTLINE} fill="url(#wa-map-fill-blue)" />

        {/* Constellation extérieure. */}
        <g stroke="url(#wa-map-stroke)" strokeWidth="0.5" strokeOpacity="0.45" fill="none">
          {CONSTELLATION.map(([id, x, y]) => {
            const n = node(id);
            return <line key={`c-${id}`} x1={n.x} y1={n.y} x2={x} y2={y} />;
          })}
          {WIRELESS.map(([a, b]) => {
            const na = node(a);
            const nb = node(b);
            return (
              <line
                key={`w-${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                strokeDasharray="1.5 3"
                strokeOpacity="0.7"
              />
            );
          })}
        </g>
        <g fillOpacity="0.8">
          {CONSTELLATION.map(([id, x, y], i) => (
            <circle key={`cd-${id}`} cx={x} cy={y} r="1.3" fill={i % 2 ? "#2563EB" : "#FF6B00"} />
          ))}
        </g>

        {/* Circuits internes, découpés à la forme du continent. */}
        <g clipPath="url(#wa-map-clip)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={AFRICA_BORDERS} stroke="url(#wa-map-stroke)" strokeWidth="0.55" strokeOpacity="0.55" />
          <g stroke="url(#wa-map-stroke)" strokeWidth="0.75" strokeOpacity="0.7">
            {CIRCUIT_TRACES.map((d, i) => (
              <path key={`t-${i}`} d={d} />
            ))}
            {CIRCUIT_STUBS.map(([x2, y2, x1, y1], i) => (
              <line key={`s-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity="0.8" />
            ))}
          </g>
          <g fill="#000" stroke="url(#wa-map-stroke)" strokeWidth="0.6">
            {CIRCUIT_STUBS.map(([x, y], i) => (
              <circle key={`v-${i}`} cx={x} cy={y} r="1.2" />
            ))}
          </g>
          {/* Impulsions de données le long des pistes. */}
          <g stroke="#FFFFFF" strokeWidth="1.3" filter="url(#wa-glow-soft)">
            {FLOW_TRACES.map((idx, i) => (
              <path
                key={`f-${idx}`}
                d={CIRCUIT_TRACES[idx]}
                pathLength={100}
                className="wa-map-flow"
                style={{ animationDelay: `${-i * 0.9}s`, animationDuration: `${4 + (i % 3)}s` }}
              />
            ))}
          </g>
        </g>

        {/* Contour néon : halo flou pulsant + trait net. */}
        <path
          d={AFRICA_OUTLINE}
          fill="none"
          stroke="url(#wa-map-stroke)"
          strokeWidth="3"
          filter="url(#wa-glow-strong)"
          className="wa-map-glow"
        />
        <motion.path
          d={AFRICA_OUTLINE}
          fill="none"
          stroke="url(#wa-map-stroke)"
          strokeWidth="1.4"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduceMotion ? 0 : 2.2, ease: "easeInOut" }}
        />

        {/* Nœuds de connexion. */}
        <g>
          {MAP_NODES.map((n, i) => {
            const hot = HIGHLIGHTED.has(n.id);
            const color = n.x < W * 0.45 ? "#FF6B00" : "#2563EB";
            return (
              <g key={n.id}>
                {hot && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r="3"
                    fill="none"
                    stroke={color}
                    strokeWidth="0.8"
                    className="wa-map-node-halo"
                    style={{ animationDelay: `${(i % 6) * 0.5}s` }}
                  />
                )}
                <circle cx={n.x} cy={n.y} r={hot ? 2.6 : 1.7} fill={color} filter="url(#wa-glow-soft)" />
                <circle cx={n.x} cy={n.y} r={hot ? 1.1 : 0.7} fill="#FFFFFF" />
              </g>
            );
          })}
        </g>
      </svg>
    </motion.div>
  );
}
