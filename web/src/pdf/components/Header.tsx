import { Text, View } from '@react-pdf/renderer'
import { colors, fonts } from '../styles/theme'

// Page header rendered in normal document flow at the top of each Page.
// We deliberately avoid `position: absolute` here — combining two
// `fixed + position:absolute` elements (header + footer) on the same
// page made react-pdf 4.5 silently drop one element's render-prop
// output. Flow positioning sidesteps the bug entirely.
export default function Header({ subtitle }: { subtitle?: string }) {
  return (
    <View
      fixed
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
        paddingBottom: 8,
        marginBottom: 16,
      }}
    >
      <Text style={{ fontFamily: fonts.display, fontSize: 11, color: colors.brand }}>
        Tietomaaperä
      </Text>
      {subtitle && (
        <Text style={{ fontSize: 9, color: colors.textDim }}>{subtitle}</Text>
      )}
    </View>
  )
}
