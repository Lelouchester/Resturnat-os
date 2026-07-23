export type LineStatus = 'active' | 'void' | 'complimentary'

export interface CartLine {
  key: string          // menuItemId + note hash, so same item with different notes are separate lines
  menuItemId: string
  name: string
  unitPrice: number
  quantity: number
  note?: string
  status: LineStatus
  voidReason?: string
}
