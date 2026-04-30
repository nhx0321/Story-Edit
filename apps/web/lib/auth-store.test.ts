import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAuthStore.setState({ token: null, user: null });
  });

  describe('initial state', () => {
    it('should have null token and user', () => {
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });
  });

  describe('setAuth', () => {
    it('should set token and user', () => {
      const user = { id: '1', email: 'test@example.com', nickname: 'Tester' };
      useAuthStore.getState().setAuth('token-abc', user);

      const state = useAuthStore.getState();
      expect(state.token).toBe('token-abc');
      expect(state.user).toEqual(user);
    });

    it('should overwrite existing auth', () => {
      useAuthStore.getState().setAuth('old-token', { id: '1', email: 'old@test.com' });
      useAuthStore.getState().setAuth('new-token', { id: '2', email: 'new@test.com' });

      const state = useAuthStore.getState();
      expect(state.token).toBe('new-token');
      expect(state.user?.id).toBe('2');
      expect(state.user?.email).toBe('new@test.com');
    });
  });

  describe('logout', () => {
    it('should clear token and user', () => {
      useAuthStore.getState().setAuth('token-abc', { id: '1' });
      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });
  });

  describe('isAdmin', () => {
    it('should return false when not logged in', () => {
      expect(useAuthStore.getState().isAdmin()).toBe(false);
    });

    it('should return false when user isAdmin is false', () => {
      useAuthStore.getState().setAuth('token', { id: '1', isAdmin: false });
      expect(useAuthStore.getState().isAdmin()).toBe(false);
    });

    it('should return true when user isAdmin is true', () => {
      useAuthStore.getState().setAuth('token', { id: '1', isAdmin: true });
      expect(useAuthStore.getState().isAdmin()).toBe(true);
    });
  });

  describe('getAdminLevel', () => {
    it('should return null when not logged in', () => {
      expect(useAuthStore.getState().getAdminLevel()).toBeNull();
    });

    it('should return null when adminLevel is undefined', () => {
      useAuthStore.getState().setAuth('token', { id: '1' });
      expect(useAuthStore.getState().getAdminLevel()).toBeNull();
    });

    it('should return the adminLevel value', () => {
      useAuthStore.getState().setAuth('token', { id: '1', adminLevel: 3 });
      expect(useAuthStore.getState().getAdminLevel()).toBe(3);
    });

    it('should return 0 when adminLevel is 0', () => {
      useAuthStore.getState().setAuth('token', { id: '1', adminLevel: 0 });
      expect(useAuthStore.getState().getAdminLevel()).toBe(0);
    });
  });
});
