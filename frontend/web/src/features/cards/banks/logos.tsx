import { Box, Typography, Stack } from '@mui/material';
import type { CardKind } from '@kippa/domain';

/**
 * Hand-built SVG emblems + wordmarks for the built-in bank presets.
 * Each renders an inline SVG emblem (white / light tones on dark card backgrounds)
 * next to a bold uppercase wordmark. Emblems are ~24x24 viewBox geometric marks.
 */

const nameStyle = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  fontWeight: 800,
  fontSize: '15px',
  color: '#ffffff',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  lineHeight: 1.1,
} as const;

const smallNameStyle = {
  ...nameStyle,
  fontSize: '13px',
  letterSpacing: '0.3px',
} as const;

// ---------------------------------------------------------------------------
// CIB — isometric cube / hexagon subdivided into 3 rhombus faces
// ---------------------------------------------------------------------------
export function CibLogo({ kind: _kind }: { kind: CardKind }) {
  // Hexagon vertices (flat-top): center (12,12), radius ~10
  // Points: top-left, top-right, right, bottom-right, bottom-left, left
  // plus a Y from center dividing into 3 rhombi (top, lower-left, lower-right)
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 24 24" width={24} height={24} style={{ flexShrink: 0 }}>
        {/* hexagon outline (pointy-top) */}
        <polygon
          points="12,2 21,7 21,17 12,22 3,17 3,7"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        {/* top rhombus */}
        <polygon points="12,2 21,7 12,12 3,7" fill="rgba(255,255,255,0.32)" />
        {/* lower-left rhombus */}
        <polygon points="3,7 12,12 12,22 3,17" fill="rgba(255,255,255,0.16)" />
        {/* lower-right rhombus */}
        <polygon points="21,7 12,12 12,22 21,17" fill="rgba(255,255,255,0.08)" />
        {/* Y divider edges for crispness */}
        <polyline points="12,2 12,12 12,22" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.8" />
        <line x1="3" y1="7" x2="21" y2="7" stroke="#ffffff" strokeWidth="0.8" opacity="0.8" />
      </svg>
      <Typography sx={nameStyle}>CIB</Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// NBE — simplified Eagle of Saladin silhouette (symmetric heraldic)
// ---------------------------------------------------------------------------
export function NbeLogo({ kind: _kind }: { kind: CardKind }) {
  // A symmetric stylized eagle: wings spread upward, head center-top, body center.
  // Built from a mirrored pair of wing paths + body + head.
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 24 24" width={24} height={24} style={{ flexShrink: 0 }}>
        {/* right wing (will be mirrored for left) */}
        <g>
          {/* left wing */}
          <path
            d="M12,6 C9,6 6,7 3,9 C4.5,8.5 6,8.5 7,9 C5.5,9.5 4,10.5 3,12 C5,11 7,11 8,12 C6.5,12.5 5,13.5 4,15 C6,14 8,14 9,15 C8,16 7.5,17 8,18 L12,15 Z"
            fill="#ffffff"
          />
          {/* right wing (mirrored) */}
          <path
            d="M12,6 C15,6 18,7 21,9 C19.5,8.5 18,8.5 17,9 C18.5,9.5 20,10.5 21,12 C19,11 17,11 16,12 C17.5,12.5 19,13.5 20,15 C18,14 16,14 15,15 C16,16 16.5,17 16,18 L12,15 Z"
            fill="#ffffff"
          />
          {/* body */}
          <path d="M12,7 L13.2,16 L12,19 L10.8,16 Z" fill="#ffffff" />
          {/* head */}
          <circle cx="12" cy="5.5" r="1.8" fill="#ffffff" />
        </g>
        {/* tiny gold accent under the body */}
        <rect x="10.6" y="19.4" width="2.8" height="0.9" rx="0.4" fill="#E0B341" />
      </svg>
      <Typography sx={nameStyle}>NBE</Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Banque Misr — stylized lotus flower (pointed petals fanning upward)
// Gold emblem on the black credit face, white on the gold debit face.
// ---------------------------------------------------------------------------
export function BanqueMisrLogo({ kind }: { kind: CardKind }) {
  const gold = kind === 'credit';
  const emblem = gold ? '#D4AF37' : '#ffffff';
  const emblemSoft = gold ? 'rgba(212,175,55,0.72)' : 'rgba(255,255,255,0.7)';
  const emblemFaint = gold ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.45)';
  // 5 pointed petals radiating up from a base, symmetric.
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 24 24" width={24} height={24} style={{ flexShrink: 0 }}>
        {/* base */}
        <path d="M7,19 C9,17 15,17 17,19 L16,21 L8,21 Z" fill={emblem} opacity="0.85" />
        {/* center petal */}
        <path d="M12,3 C12.8,7 12.8,11 12,15 C11.2,11 11.2,7 12,3 Z" fill={emblem} />
        {/* inner-left petal */}
        <path d="M9,4.5 C10,8 10.5,12 9.5,15.5 C8.2,12 7.8,8.5 9,4.5 Z" fill={emblemSoft} />
        {/* inner-right petal */}
        <path d="M15,4.5 C14,8 13.5,12 14.5,15.5 C15.8,12 16.2,8.5 15,4.5 Z" fill={emblemSoft} />
        {/* outer-left petal */}
        <path d="M6,7 C7.5,10 8,13 7,16 C5.5,13.5 5,10.5 6,7 Z" fill={emblemFaint} />
        {/* outer-right petal */}
        <path d="M18,7 C16.5,10 16,13 17,16 C18.5,13.5 19,10.5 18,7 Z" fill={emblemFaint} />
      </svg>
      <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <Typography sx={smallNameStyle}>Banque</Typography>
        <Typography sx={smallNameStyle}>Misr</Typography>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// QNB — 8-pointed star (two overlapping squares)
// ---------------------------------------------------------------------------
export function QnbLogo({ kind: _kind }: { kind: CardKind }) {
  // square A and square B rotated 45° relative, centered at (12,12), half-size ~8
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 24 24" width={24} height={24} style={{ flexShrink: 0 }}>
        {/* square 1 (axis-aligned) */}
        <rect x="5" y="5" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="1.1" />
        {/* square 2 (rotated 45°) -> drawn as a polygon diamond */}
        <polygon points="12,2 19,12 12,22 5,12" fill="none" stroke="#ffffff" strokeWidth="1.1" />
        {/* center accent */}
        <circle cx="12" cy="12" r="2.6" fill="#E53935" stroke="#ffffff" strokeWidth="0.8" />
      </svg>
      <Typography sx={nameStyle}>QNB</Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Arab Bank — three interconnected rings (chained)
// ---------------------------------------------------------------------------
export function ArabBankLogo({ kind: _kind }: { kind: CardKind }) {
  // three circles in a row, overlapping (chained), ring outlines.
  // viewBox 30 wide to fit three rings.
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 30 14" width={28} height={14} style={{ flexShrink: 0 }}>
        <circle cx="6" cy="7" r="5" fill="none" stroke="#ffffff" strokeWidth="1.2" />
        <circle cx="15" cy="7" r="5" fill="none" stroke="#ffffff" strokeWidth="1.2" />
        <circle cx="24" cy="7" r="5" fill="none" stroke="#ffffff" strokeWidth="1.2" />
      </svg>
      <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <Typography sx={smallNameStyle}>Arab</Typography>
        <Typography sx={smallNameStyle}>Bank</Typography>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// ADCB — two interlocking triangles (one outline, one filled, offset/dynamic)
// ---------------------------------------------------------------------------
export function AdcbLogo({ kind: _kind }: { kind: CardKind }) {
  // up-triangle filled (semi-transparent), down-triangle outline, overlapping.
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 24 24" width={24} height={24} style={{ flexShrink: 0 }}>
        {/* up triangle (filled, semi-transparent white) */}
        <polygon points="12,3 21,19 3,19" fill="rgba(255,255,255,0.35)" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
        {/* down triangle (outline), offset for a dynamic Star-of-David-ish look */}
        <polygon points="12,21 21,6 3,6" fill="none" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      </svg>
      <Typography sx={nameStyle}>ADCB</Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// AAIB — divided diamond with a gold accent line
// ---------------------------------------------------------------------------
export function AaibLogo({ kind: _kind }: { kind: CardKind }) {
  // rhombus divided into 4 triangles meeting at center, gold vertical accent.
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 24 24" width={24} height={24} style={{ flexShrink: 0 }}>
        {/* top */}
        <polygon points="12,2 12,12 2,12" fill="rgba(255,255,255,0.32)" />
        {/* right */}
        <polygon points="12,12 22,12 12,22" fill="rgba(255,255,255,0.16)" />
        {/* bottom */}
        <polygon points="12,12 12,22 2,12" fill="rgba(255,255,255,0.24)" />
        {/* left */}
        <polygon points="2,12 12,12 12,2" fill="rgba(255,255,255,0.08)" />
        {/* outline */}
        <polygon points="12,2 22,12 12,22 2,12" fill="none" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
        {/* gold accent line vertical */}
        <line x1="12" y1="2" x2="12" y2="22" stroke="#E0B341" strokeWidth="1.1" />
      </svg>
      <Typography sx={nameStyle}>AAIB</Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// FABMISR — wordmark-dominant with a 3-vertical-pillars mark
// ---------------------------------------------------------------------------
export function FabmisrLogo({ kind: _kind }: { kind: CardKind }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.2}>
      <svg viewBox="0 0 16 24" width={16} height={24} style={{ flexShrink: 0 }}>
        {/* three pillars, middle tallest (growth/stability motif) */}
        <rect x="1" y="7" width="3" height="15" fill="#ffffff" />
        <rect x="6.5" y="3" width="3" height="19" fill="#ffffff" />
        <rect x="12" y="9" width="3" height="13" fill="#ffffff" />
        {/* base line */}
        <rect x="0" y="21.5" width="16" height="1.5" fill="#ffffff" />
      </svg>
      <Typography sx={{ ...nameStyle, letterSpacing: '1.2px' }}>FABMISR</Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// EGBank — two interlocking rounded loops (infinity / chain link)
// ---------------------------------------------------------------------------
export function EgbankLogo({ kind: _kind }: { kind: CardKind }) {
  // two rounded loops interlocking like an infinity symbol.
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <svg viewBox="0 0 28 14" width={26} height={14} style={{ flexShrink: 0 }}>
        {/* primary white loop */}
        <path
          d="M8,2 C3.6,2 1,4.5 1,7 C1,9.5 3.6,12 8,12 C12,12 14,7 14,7 C14,7 16,2 20,2 C24.4,2 27,4.5 27,7 C27,9.5 24.4,12 20,12 C16,12 14,7 14,7"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* cyan accent line following the crossing */}
        <path
          d="M14,7 C14,7 14,7 14,7"
          fill="none"
          stroke="#22D3EE"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <Typography sx={nameStyle}>
        <Box component="span" sx={{ fontWeight: 900 }}>EG</Box>
        <Box component="span" sx={{ fontWeight: 700, opacity: 0.9 }}>Bank</Box>
      </Typography>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Other — generic fallback
// ---------------------------------------------------------------------------
export function OtherLogo({ kind: _kind }: { kind: CardKind }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box
        sx={{
          width: 22,
          height: 22,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#ffffff" strokeWidth="1.8">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      </Box>
      <Typography sx={nameStyle}>Other</Typography>
    </Stack>
  );
}
