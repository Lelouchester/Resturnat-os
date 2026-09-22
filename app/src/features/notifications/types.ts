export type NotificationTone = 'warning' | 'info' | 'success'

export interface AppNotification {
  id: string // stable, derived from the source record — used for dismissal
  tone: NotificationTone
  message: string
  linkTo?: string // route to jump to when tapped
}
