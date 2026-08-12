// Shared hitSlop for small/icon-only or tightly-bounded Pressables (delete
// buttons, month-navigation arrows) whose visible content is smaller than
// the ~44x44pt minimum tap target both platforms' accessibility guidelines
// recommend. Import this rather than inlining the object at each call
// site — a new object literal per render is harmless here (Pressable
// doesn't memo on it), but one shared constant keeps the actual pixel
// values in one place instead of six.

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const
