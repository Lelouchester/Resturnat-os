import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'

export interface Contact {
  id: string
  name: string
  phone?: string
  role?: string // free text, e.g. "Electrician", "Dairy supplier"
  notes?: string
}

interface ContactsState {
  contacts: Contact[]
  loading: boolean
  initialized: boolean
  init: () => void
  addContact: (contact: { name: string; phone?: string; role?: string; notes?: string }) => Promise<void>
  updateContact: (id: string, patch: { name?: string; phone?: string; role?: string; notes?: string }) => Promise<void>
  removeContact: (id: string) => Promise<void>
}

function mapRow(row: any): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    role: row.role ?? undefined,
    notes: row.notes ?? undefined,
  }
}

async function loadContacts(): Promise<Contact[]> {
  const { data, error } = await supabase.from('contacts').select('*').eq('branch_id', CURRENT_BRANCH_ID).order('name')
  if (error) {
    console.error('[contactsStore] failed to load contacts', error)
    return []
  }
  return (data ?? []).map(mapRow)
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadContacts().then((contacts) => set({ contacts, loading: false }))

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadContacts().then((contacts) => set({ contacts }))
    })

    supabase
      .channel(`contacts:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadContacts().then((contacts) => set({ contacts }))
      )
      .subscribe()
  },

  addContact: async (contact) => {
    const { error } = await supabase.from('contacts').insert({
      branch_id: CURRENT_BRANCH_ID,
      name: contact.name,
      phone: contact.phone || null,
      role: contact.role || null,
      notes: contact.notes || null,
    })
    if (error) console.error('[contactsStore] addContact failed', error)
    set({ contacts: await loadContacts() })
  },

  updateContact: async (id, patch) => {
    const payload: Record<string, unknown> = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.phone !== undefined) payload.phone = patch.phone || null
    if (patch.role !== undefined) payload.role = patch.role || null
    if (patch.notes !== undefined) payload.notes = patch.notes || null
    const { error } = await supabase.from('contacts').update(payload).eq('id', id)
    if (error) console.error('[contactsStore] updateContact failed', error)
    set({ contacts: await loadContacts() })
  },

  removeContact: async (id) => {
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) console.error('[contactsStore] removeContact failed', error)
    set({ contacts: await loadContacts() })
  },
}))
