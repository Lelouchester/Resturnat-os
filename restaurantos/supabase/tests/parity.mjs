import { DEFAULT_PERMISSIONS, ROLE_RANK, FEATURES, ROLE_ORDER, canManageRole, assignableRoles } from '/tmp/h/types.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`su postgres -c "psql -d rt -tA -F'|' -c \\"${sql}\\""`).toString().trim().split('\n').filter(Boolean)
let bad = 0, checked = 0
for (const role of ROLE_ORDER) {
  const dbRank = Number(q(`select staff_role_rank('${role}'::staff_role)`)[0])
  checked++; if (dbRank !== ROLE_RANK[role]) { bad++; console.log(`RANK MISMATCH ${role}: app ${ROLE_RANK[role]} vs db ${dbRank}`) }
  for (const f of FEATURES) {
    const db = q(`select role_default_permission('${role}'::staff_role, '${f.key}')`)[0] === 't'
    checked++; if (db !== DEFAULT_PERMISSIONS[role][f.key]) { bad++; console.log(`PERMISSION MISMATCH ${role}.${f.key}: app ${DEFAULT_PERMISSIONS[role][f.key]} vs db ${db}`) }
  }
}
console.log(`${checked} role/permission values compared between the app and the database: ${bad === 0 ? 'ALL MATCH' : bad + ' MISMATCHES'}`)
// hierarchy helper sanity
const t = (name, ok) => { checked++; if (!ok) { bad++; console.log('FAIL', name) } else console.log('PASS', name) }
t('manager cannot manage manager', !canManageRole('manager','manager'))
t('manager cannot manage shareholder', !canManageRole('manager','shareholder'))
t('manager can manage waiter', canManageRole('manager','waiter'))
t('shareholder can manage manager (rank)', canManageRole('shareholder','manager'))
t('admin can manage admin', canManageRole('admin','admin'))
t('waiter can manage nobody', assignableRoles('waiter').length === 0)
t('manager may assign cashier/waiter/kitchen/store only', JSON.stringify(assignableRoles('manager')) === JSON.stringify(['cashier','waiter','kitchen','store']))
t('admin may assign all 7 roles', assignableRoles('admin').length === 7)
process.exit(bad ? 1 : 0)
