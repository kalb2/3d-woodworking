// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';
import { useAppStore } from '../state/useAppStore';

afterEach(() => cleanup());

describe('AppErrorBoundary', () => {
  it('shows Back to projects instead of a blank screen, then returns home', () => {
    let crash = true;
    function Screen() {
      if (crash) throw new Error('bad project');
      return <p>Projects</p>;
    }
    const r = render(<AppErrorBoundary><Screen /></AppErrorBoundary>);
    expect(r.getByRole('alert').textContent).toContain('Something went wrong');
    expect(r.getByRole('button', { name: 'Back to projects' })).toBeTruthy();
    crash = false;
    fireEvent.click(r.getByRole('button', { name: 'Back to projects' }));
    expect(useAppStore.getState().currentView).toBe('home');
    expect(r.getByText('Projects')).toBeTruthy();
  });
});
