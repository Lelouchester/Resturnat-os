export interface BillLine {
  name: string
  quantity: number
  unitPrice: number
}

export interface BillableTable {
  id: string
  label: string
  customerName: string
  lines: BillLine[]
}
