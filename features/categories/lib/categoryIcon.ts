// Presentation-only mapping from a category's stored emoji (categories.icon
// in the DB, DEFAULT '📦' — see supabase/migrations/002_financial_schema.sql)
// to an Ionicons glyph name. Design Phase 2: emoji reads as inconsistent
// next to the rest of the app's icon-based UI, but the emoji is still the
// real stored data (including for user-created custom categories), so this
// only changes how a category is DRAWN, never what is stored. Anything not
// in this table (an unrecognized custom-category emoji) falls back to a
// generic tag icon rather than breaking.
import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'

export type IoniconName = ComponentProps<typeof Ionicons>['name']

const EMOJI_TO_ICON: Record<string, IoniconName> = {
  '🛒': 'cart-outline', // מזון וסופרמרקט
  '☕': 'cafe-outline', // מסעדות ובתי קפה
  '🏠': 'home-outline', // דיור ושכירות
  '🚗': 'car-outline', // תחבורה
  '💊': 'medkit-outline', // בריאות ורפואה
  '📚': 'book-outline', // חינוך
  '🎬': 'film-outline', // בידור ופנאי
  '🛍️': 'bag-outline', // קניות
  '🏋️': 'barbell-outline', // ספורט וכושר
  '📱': 'phone-portrait-outline', // תקשורת
  '🛡️': 'shield-checkmark-outline', // ביטוח
  '🐾': 'paw-outline', // חיות מחמד
  '✈️': 'airplane-outline', // חופשה ונסיעות
  '🎁': 'gift-outline', // מתנות ותרומות
  '⚡': 'flash-outline', // שירותים
  '💆': 'sparkles-outline', // טיפול אישי
  '👶': 'happy-outline', // ילדים
  '📦': 'cube-outline', // אחר (also the DB default, and this module's fallback)
  '💼': 'briefcase-outline', // משכורת
  '🎉': 'trophy-outline', // בונוס
  '💻': 'laptop-outline', // פרילנס
  '📈': 'trending-up-outline', // השקעות
  '💰': 'cash-outline', // אחר - הכנסה
}

const FALLBACK_ICON: IoniconName = 'pricetag-outline'

export function categoryIconName(emoji: string | null | undefined): IoniconName {
  if (!emoji) return FALLBACK_ICON
  return EMOJI_TO_ICON[emoji] ?? FALLBACK_ICON
}
