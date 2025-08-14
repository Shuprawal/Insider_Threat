// SoundUnlocker.jsx
import React, { useState } from 'react';
import { useAlerts } from './GlobalAlertsProvider';

export default function SoundUnlocker() {
  const [ok, setOk] = useState(false);
  const { setMuted } = useAlerts(); // <-- get setter from context

  const click = async () => {
    try {
      const a = new Audio('/sounds/siren-alert-96052.mp3');
      a.volume = 0.5;
      await a.play();      // user gesture => allowed
      a.pause();
      a.currentTime = 0;

      localStorage.setItem('im_sound_muted', '0'); // keep it in sync
      setMuted(false);                              // <-- unmute provider state
      setOk(true);
    } catch (e) {
      console.error('Unlock failed:', e);
      alert('Browser blocked autoplay. Change Autoplay permission to “Allow Audio and Video”.');
    }
  };

  return (
    <button
      onClick={click}
      style={{marginLeft:8, padding:'6px 10px', border:'1px solid var(--im-border)', borderRadius:8}}
    >
      {ok ? '🔓 Sound unlocked' : '🔔 Enable sound'}
    </button>
  );
}
