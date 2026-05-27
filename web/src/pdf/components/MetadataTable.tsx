import { View, Text } from '@react-pdf/renderer'
import { colors } from '../styles/theme'

interface Row {
  label: string
  value: string
}

interface Props {
  rows: Row[]
  /** Width of the label column as a fraction of total table width. */
  labelWidth?: number
}

export default function MetadataTable({ rows, labelWidth = 0.4 }: Props) {
  return (
    // wrap={false} keeps a metadata table on a single page instead of
    // splitting label/value rows across the page break. All callers fit
    // in well under one page; if a table ever grows past that, react-pdf
    // will move the whole thing to the next page rather than split it.
    <View wrap={false} style={{
      borderWidth: 0.5,
      borderColor: colors.borderLight,
      borderRadius: 4,
    }}>
      {rows.map((row, i) => (
        <View
          key={row.label}
          style={{
            flexDirection: 'row',
            borderTopWidth: i === 0 ? 0 : 0.5,
            borderTopColor: colors.borderLight,
            backgroundColor: i % 2 === 0 ? '#fff' : colors.surface,
          }}
        >
          <View style={{
            width: `${labelWidth * 100}%`,
            padding: 6,
            borderRightWidth: 0.5,
            borderRightColor: colors.borderLight,
          }}>
            <Text style={{ fontSize: 9, color: colors.textDim }}>{row.label}</Text>
          </View>
          <View style={{ flex: 1, padding: 6 }}>
            <Text style={{ fontSize: 10, color: colors.text }}>{row.value}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
