import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Button } from './Button'

interface AppErrorBoundaryProps {
  children: ReactNode
  title: string
  message: string
  retryLabel: string
  onError?: (error: Error, info: ErrorInfo) => void
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  private handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <View
        className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark"
        accessibilityRole="alert"
      >
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {this.props.title}
        </Text>

        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {this.props.message}
        </Text>

        <Button title={this.props.retryLabel} onPress={this.handleRetry} />
      </View>
    )
  }
}
