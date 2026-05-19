import { useCallback, useEffect, useState } from 'react';

export interface User {
  id: string;
  name: string;
  avatar: string;
}

export function useAuth(): {
  user: User | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('https://auth.progamestore.online/me', { credentials: 'include' })
      .then((res) => {
        if (!cancelled && res.ok) return res.json();
        return null;
      })
      .then((data: User | null) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        // 401 or network error — user is not signed in
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(() => {
    window.location.href = `https://auth.progamestore.online/login?redirect=${encodeURIComponent(window.location.href)}`;
  }, []);

  const signOut = useCallback(() => {
    fetch('https://auth.progamestore.online/logout', {
      method: 'POST',
      credentials: 'include',
    })
      .catch(() => {
        // best-effort
      })
      .finally(() => {
        setUser(null);
        window.location.reload();
      });
  }, []);

  return { user, loading, signIn, signOut };
}
