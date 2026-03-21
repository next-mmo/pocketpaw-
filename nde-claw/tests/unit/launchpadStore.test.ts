import { beforeEach, describe, expect, it } from 'vitest';
import { useLaunchpadStore } from '@/stores/launchpadStore';

function resetLaunchpadStore() {
  useLaunchpadStore.setState({
    isOpen: false,
    query: '',
    activePage: 0,
    activeFolderId: null,
  });
}

describe('launchpadStore', () => {
  beforeEach(() => {
    resetLaunchpadStore();
  });

  it('resets paging and query when closed', () => {
    useLaunchpadStore.getState().open();
    useLaunchpadStore.getState().setQuery('term');
    useLaunchpadStore.getState().setActivePage(2);
    useLaunchpadStore.getState().openFolder('media');

    useLaunchpadStore.getState().close();

    expect(useLaunchpadStore.getState()).toMatchObject({
      isOpen: false,
      query: '',
      activePage: 0,
      activeFolderId: null,
    });
  });

  it('clears folder state when setting a query', () => {
    useLaunchpadStore.getState().open();
    useLaunchpadStore.getState().openFolder('utilities');

    useLaunchpadStore.getState().setQuery('settings');

    expect(useLaunchpadStore.getState()).toMatchObject({
      query: 'settings',
      activePage: 0,
      activeFolderId: null,
    });
  });
});
