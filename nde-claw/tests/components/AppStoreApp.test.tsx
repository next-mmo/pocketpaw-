import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppStoreApp from '@/components/apps/AppStoreApp';

const { openExternalMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/utils/desktop', () => ({
  openExternal: openExternalMock,
}));

describe('AppStoreApp', () => {
  it('renders Tahoe release details and opens Apple resources from the CTA buttons', () => {
    render(<AppStoreApp appId="appstore" />);

    expect(screen.getByRole('heading', { name: 'macOS Tahoe 26' })).toBeInTheDocument();
    expect(screen.getByText('Software Update')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get macOS Tahoe' }));
    expect(openExternalMock).toHaveBeenCalledWith('https://support.apple.com/en-nz/122727');

    fireEvent.click(screen.getByRole('button', { name: 'Browse All Features' }));
    expect(openExternalMock).toHaveBeenCalledWith(
      'https://www.apple.com/ph/os/pdf/All_New_Features_macOS_Tahoe_Sept_2025.pdf',
    );
  });
});
