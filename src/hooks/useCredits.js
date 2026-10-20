import { useState, useEffect, useCallback } from 'react';
import { auth as authAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

export const useCredits = () => {
  const { currentUser } = useAuth();
  const [credits, setCredits] = useState(null);
  const [creditType, setCreditType] = useState('share-allowance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCredits = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (!currentUser) { setCredits(0); return; }
      const res = await authAPI.getCredits();
      if (res.success) {
        setCredits(res.credits === null ? Infinity : res.credits);
        setCreditType(res.creditType || 'share-allowance');
      }
    } catch (requestError) {
      setCredits(null);
      setError(requestError.message || 'Credits are unavailable');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

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
    error,
    refetch: fetchCredits
  };
};
