import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import HomePage from '../components/marketing/HomePage';

export default function Index() {
  const { currentUser } = useAuth();
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'ShareT — Your Trello. Their way in.';
    return () => { document.title = previousTitle; };
  }, []);
  return <HomePage signedIn={Boolean(currentUser)} />;
}
