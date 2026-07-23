import type { BillableTable } from './types'

// Demo standalone data — once orders/billing wire up, this is replaced by
// pulling `order_items` for the table's currently open `order` row.
export const DEMO_BILLABLE_TABLES: BillableTable[] = [
  {
    id: '1',
    label: 'Table 1',
    customerName: 'Rai family',
    lines: [
      { name: 'Chicken chilli', quantity: 1, unitPrice: 380 },
      { name: 'Chicken sekuwa', quantity: 2, unitPrice: 420 },
      { name: 'Masala tea', quantity: 4, unitPrice: 60 },
    ],
  },
  {
    id: '4',
    label: 'Table 4',
    customerName: 'Gurung',
    lines: [
      { name: 'Mutton curry', quantity: 2, unitPrice: 560 },
      { name: 'Veg thali', quantity: 1, unitPrice: 320 },
      { name: 'Buff momo (fried)', quantity: 3, unitPrice: 200 },
      { name: 'Coke', quantity: 3, unitPrice: 90 },
    ],
  },
  {
    id: '6',
    label: 'Table 6',
    customerName: 'Karki party',
    lines: [
      { name: 'Chicken momo (steamed)', quantity: 2, unitPrice: 220 },
      { name: 'Lassi', quantity: 2, unitPrice: 120 },
    ],
  },
]

