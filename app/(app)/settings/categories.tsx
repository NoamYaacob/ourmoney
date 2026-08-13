// Reached from Settings, not a tab. The entry point custom household
// categories (a literal MVP-2 exit-criterion feature) previously had
// nowhere to be reached from — product-scope-guardian finding, M6 planning.
// Also hosts category rules: every rule visible/editable in-app, and a
// mis-categorized transaction should lead back to the rule that caused it
// (ADR-027) — this list is that surface.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useCreateCategory } from '@/features/categories/hooks/useCreateCategory'
import { useUpdateCategory } from '@/features/categories/hooks/useUpdateCategory'
import { useDeleteCategory } from '@/features/categories/hooks/useDeleteCategory'
import { useCategoryRules } from '@/features/categories/hooks/useCategoryRules'
import { useCreateCategoryRule } from '@/features/categories/hooks/useCreateCategoryRule'
import { useUpdateCategoryRule } from '@/features/categories/hooks/useUpdateCategoryRule'
import { useDeleteCategoryRule } from '@/features/categories/hooks/useDeleteCategoryRule'
import { useApplyRulesRetroactively } from '@/features/categories/hooks/useApplyRulesRetroactively'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { HIT_SLOP } from '@/constants/accessibility'
import type { CategoryRuleField, CategoryRuleOperator } from '@/types/app'

const FIELD_OPTIONS: CategoryRuleField[] = ['description', 'merchant_name']
const OPERATOR_OPTIONS: CategoryRuleOperator[] = ['contains', 'equals', 'starts_with']

export default function Categories() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { categories, isLoading: isCategoriesLoadingRaw } = useCategories(householdId)
  const createCategory = useCreateCategory(householdId)
  const updateCategory = useUpdateCategory(householdId)
  const deleteCategory = useDeleteCategory(householdId)
  const { rules, isLoading: isRulesLoadingRaw } = useCategoryRules(householdId)
  // Fold in isHouseholdLoading (mobile-expo-reviewer finding — see
  // dashboard/index.tsx's identical comment for why this matters).
  const isCategoriesLoading = isHouseholdLoading || isCategoriesLoadingRaw
  const isRulesLoading = isHouseholdLoading || isRulesLoadingRaw
  const createRule = useCreateCategoryRule(householdId)
  const updateRule = useUpdateCategoryRule(householdId)
  const deleteRule = useDeleteCategoryRule(householdId)
  const applyRetroactively = useApplyRulesRetroactively(householdId)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [ruleCategoryId, setRuleCategoryId] = useState<string | null>(null)
  const [ruleField, setRuleField] = useState<CategoryRuleField>('description')
  const [ruleOperator, setRuleOperator] = useState<CategoryRuleOperator>('contains')
  const [ruleValue, setRuleValue] = useState('')

  // Inline edit affordances: one row at a time, mirroring the delete
  // button's own inline (no navigation, no modal) interaction pattern
  // already established on this screen.
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editRuleCategoryId, setEditRuleCategoryId] = useState<string | null>(null)
  const [editRuleField, setEditRuleField] = useState<CategoryRuleField>('description')
  const [editRuleOperator, setEditRuleOperator] = useState<CategoryRuleOperator>('contains')
  const [editRuleValue, setEditRuleValue] = useState('')

  const customCategories = categories.filter((c) => !c.is_system)

  return (
    <Screen>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('categories.title')}</Text>

      <Text className="mb-2 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('categories.customTitle')}
      </Text>
      {isCategoriesLoading ? (
        <SkeletonList rows={2} />
      ) : (
        <Card>
          {customCategories.length === 0 && <EmptyState icon="🏷️" message={t('categories.empty')} />}
          {customCategories.map((category, index) => (
            <View key={category.id}>
              {index > 0 && (
                <View className="my-2">
                  <Divider />
                </View>
              )}
              {editingCategoryId === category.id ? (
                <View>
                  <Input
                    label={t('categories.form.nameLabel')}
                    value={editCategoryName}
                    onChangeText={setEditCategoryName}
                    placeholder={t('categories.form.namePlaceholder')}
                  />
                  {updateCategory.isError && <ErrorMessage message={t('categories.errors.generic')} />}
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        title={t('categories.save')}
                        variant="secondary"
                        loading={updateCategory.isPending}
                        onPress={() => {
                          if (!editCategoryName.trim() || updateCategory.isPending) return
                          updateCategory.mutate(
                            { id: category.id, nameHe: editCategoryName.trim() },
                            { onSuccess: () => setEditingCategoryId(null) }
                          )
                        }}
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        title={t('common.cancel')}
                        variant="ghost"
                        onPress={() => setEditingCategoryId(null)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base text-ink-light dark:text-ink-dark">
                    {category.icon} {category.name_he}
                  </Text>
                  <View className="flex-row items-center gap-4">
                    <Pressable
                      onPress={() => {
                        setEditingCategoryId(category.id)
                        setEditCategoryName(category.name_he)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('categories.editCategoryLabel', { name: category.name_he })}
                      hitSlop={HIT_SLOP}
                    >
                      <Text className="text-sm text-accent-light dark:text-accent-dark">{t('categories.edit')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (deleteCategory.isPending) return
                        deleteCategory.mutate(category.id)
                      }}
                      disabled={deleteCategory.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t('categories.deleteCategoryLabel', { name: category.name_he })}
                      accessibilityState={{ disabled: deleteCategory.isPending, busy: deleteCategory.isPending }}
                      hitSlop={HIT_SLOP}
                    >
                      <Text className="text-sm text-danger-light dark:text-danger-dark">{t('categories.delete')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          ))}
        </Card>
      )}
      {deleteCategory.isError && <ErrorMessage message={t('categories.errors.generic')} />}

      <View className="mt-3">
        <Input
          label={t('categories.form.nameLabel')}
          value={newCategoryName}
          onChangeText={setNewCategoryName}
          placeholder={t('categories.form.namePlaceholder')}
        />
        {createCategory.isError && <ErrorMessage message={t('categories.errors.generic')} />}
        <Button
          title={t('categories.form.submit')}
          variant="secondary"
          loading={createCategory.isPending}
          onPress={() => {
            if (!householdId || !newCategoryName.trim() || createCategory.isPending) return
            createCategory.mutate(
              { householdId, nameHe: newCategoryName.trim() },
              { onSuccess: () => setNewCategoryName('') }
            )
          }}
        />
      </View>

      <Text className="mb-2 mt-8 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('categories.rulesTitle')}
      </Text>
      {isRulesLoading ? (
        <SkeletonList rows={2} />
      ) : (
        <Card>
          {rules.length === 0 && <EmptyState icon="⚙️" message={t('categories.rules.empty')} />}
          {rules.map((rule, index) => {
            const category = categories.find((c) => c.id === rule.category_id)
            return (
              <View key={rule.id}>
                {index > 0 && (
                  <View className="my-2">
                    <Divider />
                  </View>
                )}
                {editingRuleId === rule.id ? (
                  <View>
                    <Select
                      label={t('categories.rules.form.categoryLabel')}
                      options={categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))}
                      value={editRuleCategoryId}
                      onChange={setEditRuleCategoryId}
                      placeholder={t('categories.rules.form.categoryPlaceholder')}
                    />
                    <Select
                      label={t('categories.rules.form.fieldLabel')}
                      options={FIELD_OPTIONS.map((value) => ({ value, label: t(`categories.rules.field.${value}`) }))}
                      value={editRuleField}
                      onChange={(value) => setEditRuleField(value as CategoryRuleField)}
                      placeholder={t('categories.rules.form.fieldLabel')}
                    />
                    <Select
                      label={t('categories.rules.form.operatorLabel')}
                      options={OPERATOR_OPTIONS.map((value) => ({ value, label: t(`categories.rules.operator.${value}`) }))}
                      value={editRuleOperator}
                      onChange={(value) => setEditRuleOperator(value as CategoryRuleOperator)}
                      placeholder={t('categories.rules.form.operatorLabel')}
                    />
                    <Input
                      label={t('categories.rules.form.valueLabel')}
                      value={editRuleValue}
                      onChangeText={setEditRuleValue}
                      placeholder={t('categories.rules.form.valuePlaceholder')}
                    />
                    {updateRule.isError && <ErrorMessage message={t('categories.errors.generic')} />}
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Button
                          title={t('categories.rules.form.editSubmit')}
                          variant="secondary"
                          loading={updateRule.isPending}
                          onPress={() => {
                            if (!editRuleCategoryId || !editRuleValue.trim() || updateRule.isPending) return
                            updateRule.mutate(
                              {
                                id: rule.id,
                                categoryId: editRuleCategoryId,
                                field: editRuleField,
                                operator: editRuleOperator,
                                value: editRuleValue.trim(),
                              },
                              { onSuccess: () => setEditingRuleId(null) }
                            )
                          }}
                        />
                      </View>
                      <View className="flex-1">
                        <Button title={t('common.cancel')} variant="ghost" onPress={() => setEditingRuleId(null)} />
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-sm text-ink-light dark:text-ink-dark">
                      {t(`categories.rules.field.${rule.field}`)} {t(`categories.rules.operator.${rule.operator}`)}{' '}
                      &quot;{rule.value}&quot; → {category?.icon} {category?.name_he}
                    </Text>
                    <View className="flex-row items-center gap-4">
                      <Pressable
                        onPress={() => {
                          setEditingRuleId(rule.id)
                          setEditRuleCategoryId(rule.category_id)
                          setEditRuleField(rule.field)
                          setEditRuleOperator(rule.operator)
                          setEditRuleValue(rule.value)
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('categories.rules.editRuleLabel', {
                          field: t(`categories.rules.field.${rule.field}`),
                          operator: t(`categories.rules.operator.${rule.operator}`),
                          value: rule.value,
                        })}
                        hitSlop={HIT_SLOP}
                      >
                        <Text className="text-sm text-accent-light dark:text-accent-dark">{t('categories.edit')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (deleteRule.isPending) return
                          deleteRule.mutate(rule.id)
                        }}
                        disabled={deleteRule.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('categories.rules.deleteRuleLabel', {
                          field: t(`categories.rules.field.${rule.field}`),
                          operator: t(`categories.rules.operator.${rule.operator}`),
                          value: rule.value,
                        })}
                        accessibilityState={{ disabled: deleteRule.isPending, busy: deleteRule.isPending }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text className="text-sm text-danger-light dark:text-danger-dark">{t('categories.delete')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )
          })}
        </Card>
      )}
      {deleteRule.isError && <ErrorMessage message={t('categories.errors.generic')} />}

      <View className="mt-3">
        <Select
          label={t('categories.rules.form.categoryLabel')}
          options={categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))}
          value={ruleCategoryId}
          onChange={setRuleCategoryId}
          placeholder={t('categories.rules.form.categoryPlaceholder')}
        />
        <Select
          label={t('categories.rules.form.fieldLabel')}
          options={FIELD_OPTIONS.map((value) => ({ value, label: t(`categories.rules.field.${value}`) }))}
          value={ruleField}
          onChange={(value) => setRuleField(value as CategoryRuleField)}
          placeholder={t('categories.rules.form.fieldLabel')}
        />
        <Select
          label={t('categories.rules.form.operatorLabel')}
          options={OPERATOR_OPTIONS.map((value) => ({ value, label: t(`categories.rules.operator.${value}`) }))}
          value={ruleOperator}
          onChange={(value) => setRuleOperator(value as CategoryRuleOperator)}
          placeholder={t('categories.rules.form.operatorLabel')}
        />
        <Input
          label={t('categories.rules.form.valueLabel')}
          value={ruleValue}
          onChangeText={setRuleValue}
          placeholder={t('categories.rules.form.valuePlaceholder')}
        />
        {createRule.isError && <ErrorMessage message={t('categories.errors.generic')} />}
        <Button
          title={t('categories.rules.form.submit')}
          variant="secondary"
          loading={createRule.isPending}
          onPress={() => {
            if (!householdId || !ruleCategoryId || !ruleValue.trim() || createRule.isPending) return
            createRule.mutate(
              { householdId, categoryId: ruleCategoryId, field: ruleField, operator: ruleOperator, value: ruleValue.trim() },
              { onSuccess: () => setRuleValue('') }
            )
          }}
        />
      </View>

      <View className="mt-6">
        <Button
          title={t('categories.rules.applyRetroactively')}
          variant="ghost"
          loading={applyRetroactively.isPending}
          onPress={() => applyRetroactively.mutate()}
        />
      </View>
    </Screen>
  )
}
