import { useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function TrelloCallback() {
  useEffect(() => {
    // pathname sadece /trello/callback olacak
    console.log('pathname:', window.location.pathname);
    console.log('hash:', window.location.hash);

    const hash = window.location.hash.substring(1); // remove #
    const params = new URLSearchParams(hash);
    const trelloToken = params.get('token');

    console.log('trelloToken:', trelloToken);

    if (!trelloToken) return;

    axios.post(`${API_URL}/trello/connect`, {
      trelloToken
    }, {
      withCredentials: true
    }).then(() => {
      console.log('Trello connected');
      window.close();
    }).catch(err => {
      console.error('Trello connect failed', err);
    });
  }, []);

  return <div>Connecting Trello…</div>;
}
