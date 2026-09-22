export interface MenuItem {
  id: string
  name: string
  price: number
  categoryId: string
  prepTimeMinutes?: number
  isFavorite?: boolean
  isAvailable?: boolean
  comboItemIds?: string[] // other menu items bundled into this one, at the set `price`
  trackedInventoryItemId?: string // when set, selling this item decreases that inventory item's stock 1:1, and buying it in Purchasing increases it — for things sold directly like beer, liquor, cigarettes
  happyHour?: {
    price: number
    startTime: string // "HH:MM"
    endTime: string // "HH:MM"
  }
}

export interface MenuCategory {
  id: string
  name: string
  excludeFromDiscount?: boolean // e.g. alcohol/beer — never discounted at Billing
}
