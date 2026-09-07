export interface BillLine {
  name: string
  quantity: number
  unitPrice: number
  excludeFromDiscount?: boolean
  isComplimentary?: boolean
}

export interface BillableTable {
  id: string
  label: string
  customerName: string
  lines: BillLine[]
}
