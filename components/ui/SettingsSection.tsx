// Design Phase 3: groups related SettingsRow children into one Card with
// Divider separators, instead of each action getting its own bordered
// rectangle — pairs with SettingsRow.tsx.
import { Children, Fragment, isValidElement, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Card } from './Card'
import { Divider } from './Divider'

interface SettingsSectionProps {
  title?: string
  children: ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const items = Children.toArray(children).filter(isValidElement)

  return (
    <View className="mb-6">
      {title && (
        <Text className="mb-2 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">{title}</Text>
      )}
      <Card>
        {items.map((child, index) => (
          <Fragment key={child.key ?? index}>
            {index > 0 && (
              <View className="my-1">
                <Divider />
              </View>
            )}
            {child}
          </Fragment>
        ))}
      </Card>
    </View>
  )
}
