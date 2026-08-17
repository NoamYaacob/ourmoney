// The one reusable conflict experience for every optimistic-concurrency
// mutation added by migration 009 (ADR-036) — not three unrelated Alert
// strings across obligations/recurring/goals. Deliberately offers exactly
// two actions: reload the latest server version, or cancel. It never
// auto-overwrites the newer server version and never auto-retries the stale
// mutation with the new version — either of those would defeat optimistic
// concurrency protection (design brief §11).

import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'

interface ConflictModalProps {
  visible: boolean
  kind: 'conflict' | 'not_found'
  onReload: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConflictModal({ visible, kind, onReload, onCancel, loading = false }: ConflictModalProps) {
  const { t } = useTranslation()

  return (
    <Modal
      visible={visible}
      title={kind === 'conflict' ? t('concurrency.conflictTitle') : t('concurrency.notFoundTitle')}
      message={kind === 'conflict' ? t('concurrency.conflictMessage') : t('concurrency.notFoundMessage')}
      confirmLabel={t('concurrency.reloadLatest')}
      cancelLabel={t('common.cancel')}
      onConfirm={onReload}
      onCancel={onCancel}
      loading={loading}
    />
  )
}
