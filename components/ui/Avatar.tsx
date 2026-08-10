import { Image, Text, View } from 'react-native'

interface AvatarProps {
  displayName: string
  avatarUrl?: string | null
  size?: number
}

// First letter of the first word, plus the first letter of the second word
// if there is one — a single-word name (common for Hebrew display names)
// falls back to one initial rather than an empty/awkward result.
export function getInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0]?.[0] ?? ''
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : ''
  return (first + second).toUpperCase()
}

export function Avatar({ displayName, avatarUrl, size = 40 }: AvatarProps) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 }

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={dimensionStyle}
        accessibilityLabel={displayName}
      />
    )
  }

  return (
    <View
      style={dimensionStyle}
      className="items-center justify-center bg-accent-light dark:bg-accent-dark"
      accessibilityLabel={displayName}
    >
      <Text className="font-semibold text-white" style={{ fontSize: size * 0.4 }}>
        {getInitials(displayName)}
      </Text>
    </View>
  )
}
