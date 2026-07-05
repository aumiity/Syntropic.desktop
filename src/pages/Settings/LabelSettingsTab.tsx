import * as React from 'react'
import { LabelDesigner } from '@/components/label/LabelDesigner'

// ตั้งค่า > ฉลากยา — the DRUG-label designer. The full editor (preview + paper +
// per-section style + save/test-print) moved to src/components/label/LabelDesigner
// so the blank-label designer (/products/print > ฉลากเปล่า, profile='blank') can
// reuse it against its own independent label_settings row. This wrapper keeps the
// Settings import path + the sub-tab strip actions slot unchanged.
export function LabelSettingsTab({ onActions }: { onActions?: (node: React.ReactNode) => void }) {
  return <LabelDesigner profile="drug" onActions={onActions} />
}
