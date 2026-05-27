import { Svg, Circle, Polygon, Text as SvgText } from '@react-pdf/renderer'
import { View, Text } from '@react-pdf/renderer'
import { colors } from '../styles/theme'
import { RISK_LABELS_FI } from '../lib/format'
import type { RiskClass } from '../../lib/types'

const FILLS: Record<RiskClass, string> = {
  stable:            colors.riskStable,
  monitor:           colors.riskMonitor,
  attention:         colors.riskAttention,
  urgent:            colors.riskUrgent,
  insufficient_data: colors.riskInsufficient,
}

interface RiskBadgeProps {
  riskClass: RiskClass
  size?: 'small' | 'large'
}

// Shape semantics paired with colour (WCAG):
//   ● filled circle  = settled / no action needed
//   ▲ filled triangle = warning (monitor / attention / urgent — colour
//                       gradient handles severity)
//   ? question mark   = insufficient data
//
// Helvetica's WinAnsiEncoding doesn't include U+25CF or U+25B2, so we
// draw the shapes as SVG primitives instead of placing them as text.
// This renders reliably across PDF viewers and ignores font fallback.
// Tracked under "Known Issues" in CLAUDE.md (built-in Type 1 font limitation).
function ShapeIcon({ riskClass, sizePx }: { riskClass: RiskClass; sizePx: number }) {
  const s = sizePx
  return (
    <Svg width={s} height={s} style={{ marginRight: 6 }}>
      {riskClass === 'stable' ? (
        <Circle cx={s / 2} cy={s / 2} r={s * 0.4} fill="#fff" />
      ) : riskClass === 'insufficient_data' ? (
        <SvgText
          x={s / 2}
          y={s * 0.72}
          style={{ fontSize: s * 0.8 }}
          fill="#fff"
          textAnchor="middle"
        >
          ?
        </SvgText>
      ) : (
        // Equilateral-ish warning triangle, centred in the box.
        <Polygon
          points={`${s * 0.5},${s * 0.12} ${s * 0.88},${s * 0.85} ${s * 0.12},${s * 0.85}`}
          fill="#fff"
        />
      )}
    </Svg>
  )
}

export default function RiskBadge({ riskClass, size = 'small' }: RiskBadgeProps) {
  const fill = FILLS[riskClass]
  const label = RISK_LABELS_FI[riskClass] ?? riskClass
  const isLarge = size === 'large'
  const iconPx = isLarge ? 18 : 11

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fill,
        paddingVertical: isLarge ? 8 : 4,
        paddingHorizontal: isLarge ? 14 : 8,
        borderRadius: 4,
        alignSelf: 'flex-start',
      }}
    >
      <ShapeIcon riskClass={riskClass} sizePx={iconPx} />
      <Text style={{ color: '#fff', fontSize: isLarge ? 16 : 10, fontWeight: 600 }}>
        {label}
      </Text>
    </View>
  )
}
