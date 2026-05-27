// Visual tokens for the PDF report. Sourced from CLAUDE.md's brand
// palette and tuned for print (white background, deep text).

import { StyleSheet } from '@react-pdf/renderer'

export const colors = {
  text:        '#111827',
  textDim:     '#4B5563',
  border:      '#D1D5DB',
  borderLight: '#E5E7EB',
  surface:     '#F9FAFB',
  brand:       '#1E3A8A',  // deep blue — technical/credible
  riskStable:    '#2D6A4F',
  riskMonitor:   '#F1A208',
  riskAttention: '#DC4C25',
  riskUrgent:    '#9B1B30',
  riskInsufficient: '#6B7280',
} as const

// react-pdf ships Helvetica, Times-Roman and Courier as PDF-standard fonts
// (no network fetch, no registration). They render predictably across
// viewers; custom fonts are a Day 7+ refactor when we settle the brand.
export const fonts = {
  body:    'Helvetica',
  display: 'Times-Roman',
} as const

export const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.text,
  },
  h1: { fontFamily: fonts.display, fontSize: 26, marginBottom: 12, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 16, marginTop: 16, marginBottom: 8 },
  h3: { fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 4 },
  p:  { marginBottom: 8, lineHeight: 1.5 },
  small:   { fontSize: 9, color: colors.textDim, lineHeight: 1.5 },
  mono:    { fontFamily: 'Courier', fontSize: 9 },
})
