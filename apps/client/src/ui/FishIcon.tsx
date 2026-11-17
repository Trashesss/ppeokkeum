import type { FishSpecies } from '@fishing/shared';

export function FishIcon({ species, hidden = false, size = 72 }: { species: FishSpecies; hidden?: boolean; size?: number }) {
  const [body, belly] = hidden ? ['var(--silhouette)', 'var(--silhouette)'] : species.colors;
  if (species.id === 'moon-ray') {
    return (
      <svg width={size} height={size * 0.6} viewBox="0 0 100 60" aria-hidden>
        <polygon points="8,30 50,6 76,30 50,54" fill={body} />
        <polygon points="50,16 68,30 50,44 30,30" fill={belly} opacity={hidden ? 1 : 0.55} />
        <line x1="76" y1="30" x2="98" y2="30" stroke={body} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 100 60" aria-hidden>
      <polygon points="74,30 97,11 92,30 97,49" fill={body} />
      <polygon points="40,10 56,4 60,14" fill={body} />
      <ellipse cx="44" cy="30" rx="34" ry="18" fill={body} />
      <path d="M12 33 Q44 50 76 33 Q60 46 44 47 Q24 46 12 33 Z" fill={belly} />
      {!hidden && <circle cx="22" cy="26" r="3.2" fill="#1e1b1a" />}
    </svg>
  );
}
