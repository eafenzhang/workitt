import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; label?: string; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  componentDidCatch(e: Error) {
    console.error('[ErrorBoundary' + (this.props.label ? ' ' + this.props.label : '') + ']', e.message, e.stack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', fontSize: 14 }}>
          <h2 style={{ color: 'red' }}>渲染错误{this.props.label ? ' - ' + this.props.label : ''}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.error.message}</pre>
          <details style={{ marginTop: 16 }}>
            <summary>完整堆栈</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{this.state.error.stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
