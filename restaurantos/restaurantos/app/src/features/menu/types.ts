export interface MenuItem {
  id: string
  name: string
  price: number
  categoryId: string
  prepTimeMinutes?: number
  isFavorite?: boolean
  isAvailable?: boolean
  comboItemIds?: string[] // other menu items bundled into this one, at the set `price`
  happyHour?: {
    price: number
    startTime: string // "HH:MM"
    endTime: string // "HH:MM"
  }
}

export interface MenuCategory {
  id: string
  name: string
}
