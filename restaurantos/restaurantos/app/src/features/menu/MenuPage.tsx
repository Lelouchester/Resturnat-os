import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import { useMenuStore } from './menuStore'
import { ItemFormModal } from './ItemFormModal'
import type { MenuItem } from './types'

export function MenuPage() {
  const categories = useMenuStore((s) => s.categories)
  const items = useMenuStore((s) => s.items)
  const loading = useMenuStore((s) => s.loading)
  const init = useMenuStore((s) => s.init)
  const addCategory = useMenuStore((s) => s.addCategory)
  const saveItem = useMenuStore((s) => s.saveItem)
  const deleteItem = useMenuStore((s) => s.deleteItem)
  const toggleAvailability = useMenuStore((s) => s.toggleAvailability)

  useEffect(() => {
    init()
  }, [init])

  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [editingItem, setEditingItem] = useState<MenuItem | 'new' | null>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const visibleItems = activeCategory === 'all' ? items : items.filter((i) => i.categoryId === activeCategory)

  function handleAddCategory() {
    if (!newCategoryName.trim()) return
    addCategory(newCategoryName.trim())
    setNewCategoryName('')
    setAddingCategory(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-ticket text-xl font-bold">Menu</h1>
          <p className="text-sm text-ink/50">{items.length} items · {categories.length} categories</p>
        </div>
        <button
          onClick={() => setEditingItem('new')}
          className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95 active:scale-[0.98] transition-all"
        >
          <Plus size={16} /> Add item
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4">
        <button
          onClick={() => setActiveCategory('all')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
            activeCategory === 'all' ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
              activeCategory === c.id ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
            }`}
          >
            {c.name}
          </button>
        ))}
        {!addingCategory ? (
          <button
            onClick={() => setAddingCategory(true)}
            className="shrink-0 flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold border border-dashed border-ink/20 text-ink/40"
          >
            <Plus size={12} /> Category
          </button>
        ) : (
          <div className="shrink-0 flex items-center gap-1">
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Name"
              className="w-28 text-xs rounded-full border border-ink/10 px-3 py-1.5 outline-none focus:border-ember"
            />
            <button onClick={handleAddCategory} className="text-xs font-semibold text-ember">Add</button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-ink/5 animate-pulse" />)
        ) : (
          <>
            {visibleItems.map((item) => {
              const category = categories.find((c) => c.id === item.categoryId)
              const unavailable = item.isAvailable === false
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 bg-surface border border-ink/5 rounded-2xl p-3.5 ${unavailable ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.isFavorite && <Star size={13} className="text-ember fill-ember shrink-0" />}
                      <span className="text-sm font-semibold truncate">{item.name}</span>
                    </div>
                    <div className="text-xs text-ink/40 mt-0.5">
                      {category?.name}{item.prepTimeMinutes ? ` · ${item.prepTimeMinutes} min` : ''}
                      {unavailable ? ' · Unavailable' : ''}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {item.comboItemIds && item.comboItemIds.length > 0 && (
                        <span className="text-[10px] font-bold rounded-full bg-status-reserved-bg text-status-reserved px-1.5 py-0.5">
                          COMBO · {item.comboItemIds.length} items
                        </span>
                      )}
                      {item.happyHour && (
                        <span className="text-[10px] font-bold rounded-full bg-ember/15 text-ember px-1.5 py-0.5">
                          HAPPY HOUR Rs. {item.happyHour.price} ({item.happyHour.startTime}–{item.happyHour.endTime})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-ticket text-sm font-bold shrink-0">Rs. {item.price}</div>
                  <button
                    onClick={() => toggleAvailability(item.id)}
                    className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${unavailable ? 'bg-ink/15' : 'bg-status-available'}`}
                    title="Toggle availability"
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform ${unavailable ? 'translate-x-0.5' : 'translate-x-4'}`} />
                  </button>
                  <button onClick={() => setEditingItem(item)} className="shrink-0 text-ink/40 hover:text-ink">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="shrink-0 text-ink/40 hover:text-status-cleaning">
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
            {visibleItems.length === 0 && (
              <p className="text-sm text-ink/40 text-center py-10">No items in this category yet.</p>
            )}
          </>
        )}
      </div>

      {editingItem && (
        <ItemFormModal
          categories={categories}
          allItems={items}
          initial={editingItem === 'new' ? undefined : editingItem}
          onSave={(data) => { saveItem(data); setEditingItem(null) }}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}
