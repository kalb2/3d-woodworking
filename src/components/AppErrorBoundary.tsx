import React from 'react';
import { reportJsError } from '../native/jsErrors';
import { useAppStore } from '../state/useAppStore';

interface State {
  error: Error | null;
}

/** Last resort so a 3D or project-file render error does not leave a blank WebView. */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportJsError(error);
  }

  private back = () => {
    useAppStore.getState().setView('home');
    useAppStore.getState().dismissOverlays();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="app-error"
        style={{
          minHeight: '100dvh',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 12,
          padding: 'calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Something went wrong</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, maxWidth: 420 }}>
          This screen hit a problem. Projects already saved on this device are still there.
        </p>
        <button type="button" onClick={this.back} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '10px 16px' }}>
          Back to projects
        </button>
      </div>
    );
  }
}
