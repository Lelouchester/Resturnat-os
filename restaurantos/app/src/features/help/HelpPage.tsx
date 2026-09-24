import { useMemo, useState } from 'react'
import { Search, ChevronDown, HelpCircle } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useAuthStore } from '../auth/authStore'

interface Item {
  q: string
  a: string
}
interface Section {
  title: string
  // Shown only as a note under the heading — content stays visible to
  // everyone, since a waiter reading how billing works, say, is useful
  // context even if they can't open that screen themselves.
  note?: string
  items: Item[]
}

// Written to describe what the app actually does today, not how things are
// meant to work eventually — keep this in step with real behaviour when a
// screen changes, or it becomes actively misleading rather than just stale.
const SECTIONS: Section[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How do I sign in?',
        a: 'On the login screen, enter your cafe\'s code, then continue with the Google account your administrator added you with. There is no separate RestaurantOS password — it is always your Google sign-in.',
      },
      {
        q: 'It says "Cafe not found" when I enter the code.',
        a: 'Check for typos and extra spaces. If the code is definitely right and it still fails, the person managing the cafe may need to refresh the database\'s connection — ask them to try again in a minute.',
      },
      {
        q: 'I signed in but the app says I\'m not set up.',
        a: 'An administrator needs to add your Google email as staff on the Staff page before you can get in, and your account needs to be active (not deactivated).',
      },
      {
        q: 'Why can I only see some of the menu, not everything?',
        a: 'What you see is based on your role and any specific permissions your administrator has set for you. If something is missing that you need for your job, ask an administrator to check your access on the Staff page.',
      },
    ],
  },
  {
    title: 'Tables & the floor',
    items: [
      {
        q: 'What do the table colors mean?',
        a: 'Each table shows its current status: available to seat, occupied (has an active order), needs cleaning (just paid, not reset yet), reserved, or being billed.',
      },
      {
        q: 'How do I merge two tables into one bill?',
        a: 'From the floor, use the merge option on the table and choose the other table to combine into it. Everything moves onto one bill; the other table becomes a Rs. 0 shell until it\'s cleared.',
      },
      {
        q: 'How do I seat a reservation?',
        a: 'Assign a table to the reservation from the Tables screen. Note: reservations are currently always treated as being for today — there is no way yet to book a table for a future date.',
      },
      {
        q: 'A table looks occupied but there\'s no one there.',
        a: 'It may have items that were never billed, or the app didn\'t refresh after a bill closed. Tap into the table to check its order, or ask someone with billing access to look.',
      },
    ],
  },
  {
    title: 'Taking orders',
    items: [
      {
        q: 'How do I add items to an order?',
        a: 'Open the table from Orders, tap items to add them to the cart, then send them to the kitchen. Only one cart is open per table at a time — if you switch to another table before sending, remember to come back and send the first one.',
      },
      {
        q: 'I marked an item "Unavailable" in the Menu, but staff can still order it.',
        a: 'This is a known gap being worked on — marking an item unavailable does not yet stop it from being added to an order. For now, let staff know by word of mouth as well.',
      },
      {
        q: 'How do I cancel an order that hasn\'t been billed yet?',
        a: 'From the Orders screen, use Cancel order. This works for any order that hasn\'t reached Billing yet, and for anyone who takes orders — no special permission needed. If money has already been taken as an advance on that order, it can\'t be cancelled this way; it has to be finished through Billing instead, since the payment needs a bill to close against.',
      },
      {
        q: 'What\'s a "staff table" / no-charge order?',
        a: 'It\'s for recording something the team ate or drank without charging a customer — for example a staff meal. It\'s tracked for stock and record-keeping, but it never counts as sales anywhere in Reports or Order History.',
      },
    ],
  },
  {
    title: 'Kitchen',
    items: [
      {
        q: 'Where do sent orders show up?',
        a: 'On the Kitchen screen, as tickets grouped by table, in the order they were sent.',
      },
      {
        q: 'How do I mark an item as ready or served?',
        a: 'Tap through its status on the ticket — items typically move from waiting, to preparing, to ready, to served.',
      },
      {
        q: 'The notification bell says a table is "waiting on kitchen" but it has already been served.',
        a: 'This is a known bug — the alert can be slow to clear and doesn\'t always reflect the current status right away. Check the actual ticket rather than relying on the bell alone.',
      },
    ],
  },
  {
    title: 'Billing & payments',
    note: 'Requires billing access',
    items: [
      {
        q: 'How do I take a payment for a table?',
        a: 'Open the table in Billing, confirm the bill (discount, service charge, tax, tip if any), enter the amount for each payment method used, then Complete Payment. The whole thing is saved as one step — if anything goes wrong partway through, nothing is left half-recorded.',
      },
      {
        q: 'The app is warning me a payment looks too large — what do I do?',
        a: 'It shows this when a payment, especially on eSewa or Fonepay, is far above the bill — usually a sign a digit was mistyped, since digital payments have no reason to exceed what\'s owed. If the amount is genuinely correct, confirm it and it will save as entered. If not, fix the amount before confirming.',
      },
      {
        q: 'Can I split a bill across cash and a digital method?',
        a: 'Yes — enter an amount against each method being used; they\'re added together against the bill.',
      },
      {
        q: 'How do I record a payment while the table is still open (before the final bill)?',
        a: 'Use the partial-payment option on the order — it deposits the money right away but doesn\'t close the table, so you can keep adding items. When the table is finally billed, any partial payments already made are automatically taken into account.',
      },
      {
        q: 'A customer wants to pay part now and owe the rest.',
        a: 'Attach the customer to the bill, then complete the payment for whatever amount they\'re paying now. The remainder is recorded as a due against that customer\'s profile in Customers.',
      },
      {
        q: 'How do I cancel an already-billed (paid) order?',
        a: 'This is different from cancelling an order that hasn\'t been billed yet. It reverses the money and needs the "cancel paid orders" permission, which by default only Administrators and Shareholders have. It only works on an order closed today. If you need it and don\'t have it, ask an administrator to grant it.',
      },
    ],
  },
  {
    title: 'Accounts & shifts',
    note: 'Requires shifts/financials access',
    items: [
      {
        q: 'What does "closing the day" actually do?',
        a: 'It closes the current shift, downloads a backup file of the day\'s orders and totals, and locks in the closing balances you count for each payment method.',
      },
      {
        q: 'The backup file didn\'t download.',
        a: 'The app will now ask whether to close the day anyway without a backup, rather than closing silently. If this happens, check your connection before confirming, and try again once it\'s stable if you can.',
      },
      {
        q: 'Who can correct an account balance?',
        a: 'Only someone with the "correct account balances" permission — by default Administrators and Managers, not Shareholders. It\'s meant for real corrections (a miscount), not routine cash movement.',
      },
      {
        q: 'How do I see all of today\'s billed orders?',
        a: 'Order History on the Accounts page. Staff (no-charge) orders and any merged-table shells are shown separately and are never included in the total.',
      },
    ],
  },
  {
    title: 'Reports',
    note: 'Requires reports access',
    items: [
      {
        q: 'What\'s the difference between Today, Detailed Reports, and Trends?',
        a: 'Today is a quick daily snapshot. Detailed Reports lets you pick a date range for sales, items, and payment methods. Trends compares sales against purchases over 7, 30 or 90 days, with a day-by-day breakdown.',
      },
      {
        q: 'Where do I see how much was given away in discounts?',
        a: 'The "Discounts given" card, shown on the Today view and on Trends. It totals discounts for today, 7 days, or 30 days, and compares against the period before.',
      },
      {
        q: 'The 30-day report looks lower than I expect.',
        a: 'On a very busy 30-day range, older orders can occasionally be cut off by a technical limit on how many rows load at once — this is a known issue being worked on. If a number looks off, cross-check it against Trends or a shorter range.',
      },
      {
        q: '"Print item sales" produces a blank page.',
        a: 'Known issue — the print layout isn\'t rendering correctly right now. Use the on-screen report instead until this is fixed.',
      },
    ],
  },
  {
    title: 'Inventory & purchasing',
    note: 'Requires inventory/purchasing access',
    items: [
      {
        q: 'How does stock get reduced?',
        a: 'Automatically, for any menu item linked to a tracked inventory item, when it\'s sold. You can also adjust stock by hand for spoilage, counting corrections, and so on.',
      },
      {
        q: 'How do I record a new purchase from a supplier?',
        a: 'From Purchasing, start a new purchase, add the items and costs, and record any payment made against it. It updates stock and the supplier\'s balance together.',
      },
      {
        q: 'Can I cancel a purchase?',
        a: 'Yes, for a purchase made today, if you have purchasing access. It reverses the stock and any payment recorded against it.',
      },
      {
        q: 'The Purchasing CSV export looks misaligned when opened in Excel.',
        a: 'Known issue with the date column in that export — being fixed. Double-check totals against the on-screen report if you rely on the export.',
      },
    ],
  },
  {
    title: 'Customers',
    note: 'Requires customers access',
    items: [
      {
        q: 'How do I see who owes money?',
        a: 'The Dues view on the Customers page lists everyone with an outstanding balance.',
      },
      {
        q: 'How does a customer settle a due?',
        a: 'Open their profile and record the settlement against whichever payment method they used — it reduces their outstanding balance and deposits the money the same way a normal payment does.',
      },
      {
        q: 'A repeat order added the wrong number of items.',
        a: 'If the menu hasn\'t finished loading yet when you use "repeat order," it can add fewer items than expected. Wait a moment after opening the app before using it, and double-check the cart before sending.',
      },
    ],
  },
  {
    title: 'Staff & roles',
    note: 'Administrator only',
    items: [
      {
        q: 'What are the roles, from most to least access?',
        a: 'Administrator, Shareholder, Manager, Cashier, then Waiter / Kitchen / Store. Nobody can create, edit, promote, deactivate or remove someone at or above their own level — an Administrator is the only one who can manage everyone, including other Administrators.',
      },
      {
        q: 'What can a Shareholder do?',
        a: 'Nearly everything day-to-day, including cancelling an already-billed order. They cannot manage staff, change Settings, or correct account balances.',
      },
      {
        q: 'Why can\'t a Manager cancel an already-billed order anymore?',
        a: 'This was changed deliberately: the person doing the billing shouldn\'t also be the one who can undo money already taken, without another person\'s say-so. A Manager can still be granted this specific permission from their Permissions panel if needed.',
      },
      {
        q: 'What is Login activity, and who can see it?',
        a: 'It shows how often each person opens the app, per day, and when they were last seen. It is visible to Administrators only — Shareholders and everyone else cannot see it.',
      },
      {
        q: 'Someone left — what should I do?',
        a: 'Deactivate them on the Staff page rather than deleting them if they have any order, shift, or purchase history (the app will do this automatically if deleting isn\'t possible). A deactivated person loses all access immediately, everywhere, including if they try to reach the app directly.',
      },
    ],
  },
  {
    title: 'Settings',
    note: 'Administrator/Manager only',
    items: [
      {
        q: 'Where do I change the tax rate or service charge?',
        a: 'The Settings page. Changes apply to bills going forward, not to orders already closed.',
      },
      {
        q: 'How do I add or remove a payment method?',
        a: 'Settings → Payment methods. Removing one that has ever been used for a real payment is blocked automatically, to protect that history — deactivate it instead if you want it to stop appearing on the billing screen.',
      },
      {
        q: 'It says "Saved" but I\'m not sure it actually saved.',
        a: 'If a save genuinely fails (for example, no connection), the app should now show an error rather than "Saved" — if you ever see "Saved" and the change doesn\'t stick on reload, treat that as worth reporting.',
      },
    ],
  },
  {
    title: 'Something looks wrong — troubleshooting',
    items: [
      {
        q: 'A number doesn\'t match what I expected.',
        a: 'Cross-check it against a different report covering the same period (for example, Trends vs. Detailed Reports), and check whether staff orders or cancelled orders might explain the gap — they\'re excluded from sales everywhere, which can look surprising if you\'re expecting a raw total.',
      },
      {
        q: 'The floor suddenly shows every table as empty.',
        a: 'This can happen after a dropped connection. Wait a moment for it to reconnect and refresh, and avoid starting a new order on a table you know was occupied until it does — check with whoever was serving that table first.',
      },
      {
        q: 'Something failed and I don\'t know if it saved.',
        a: 'Recent updates made failures show a clear on-screen message instead of failing silently. If you see an error, nothing was saved — it\'s safe to try again. If you\'re ever unsure, check the relevant screen (Order History, the table, the customer\'s due) before repeating an action involving money.',
      },
      {
        q: 'I found a bug not listed here.',
        a: 'Tell an administrator what you were doing, what you expected, and what happened instead — that\'s exactly what gets fixed next.',
      },
    ],
  },
]

function normalize(s: string): string {
  return s.toLowerCase()
}

export function HelpPage() {
  const staff = useAuthStore((s) => s.staff)
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set([SECTIONS[0].title]))

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return SECTIONS
    return SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => normalize(item.q).includes(q) || normalize(item.a).includes(q)),
    })).filter((section) => section.items.length > 0)
  }, [query])

  function toggle(title: string) {
    setOpenSections((cur) => {
      const next = new Set(cur)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const searching = query.trim().length > 0

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <HelpCircle size={20} className="text-ember" />
        <h1 className="font-ticket text-lg font-bold">Help & guides</h1>
      </div>
      <p className="text-sm text-ink/50 mb-4">
        {staff ? `Signed in as ${staff.name} (${staff.role})` : 'How to use RestaurantOS, screen by screen.'}
      </p>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a question, e.g. 'discount' or 'cancel'"
          className="w-full text-sm border border-ink/10 rounded-2xl pl-9 pr-3 py-2.5 outline-none focus:border-ember bg-surface"
        />
      </div>

      {searching && filtered.length === 0 && (
        <p className="text-sm text-ink/40">No matches for "{query}" — try a different word, or ask an administrator.</p>
      )}

      <div className="space-y-3">
        {filtered.map((section) => {
          const isOpen = searching || openSections.has(section.title)
          return (
            <Card key={section.title} className="p-0 overflow-hidden">
              <button
                onClick={() => toggle(section.title)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left"
              >
                <div>
                  <div className="font-semibold text-sm">{section.title}</div>
                  {section.note && <div className="text-[11px] text-ink/40">{section.note}</div>}
                </div>
                <ChevronDown size={16} className={`text-ink/40 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {section.items.map((item, i) => (
                    <div key={i} className="border-t border-ink/5 pt-3">
                      <div className="text-sm font-semibold mb-1">{item.q}</div>
                      <div className="text-sm text-ink/60 leading-relaxed">{item.a}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
