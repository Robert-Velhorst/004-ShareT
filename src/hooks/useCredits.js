import { useState, useEffect, useCallback } from 'react';
import { auth as authAPI } from '../api';

export const useCredits = () => {
  const [credits, setCredits] = useState(0);
  const [creditType, setCreditType] = useState('share-allowance');
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { setLoading(false); return; }
      const res = await authAPI.getCredits();
      if (res.success) {
        setCredits(res.credits === null ? Infinity : res.credits);
        setCreditType(res.creditType || 'share-allowance');
      }
    } catch {
      setCredits(0); // A failed balance check must never grant unlimited spending.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
    window.addEventListener('sharet-credits-changed', fetchCredits);
    window.addEventListener('focus', fetchCredits);
    return () => {
      window.removeEventListener('sharet-credits-changed', fetchCredits);
      window.removeEventListener('focus', fetchCredits);
    };
  }, [fetchCredits]);

  return {
    credits,
    creditType,
    freeSharesLeft: credits === Infinity ? Infinity : credits,
    loading,
    refetch: fetchCredits
  };
};
