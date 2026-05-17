import { useEffect, useRef } from 'react';
import { useArduino } from '../contexts/ArduinoContext';
import { speak as speechSpeak, PRIORITY_DEFAULT } from '../utils/speechManager';

/**
 * When Arduino connection is lost (unexpected drop), speaks the message to the user
 * and clears it so it is only announced once. Uses default priority so it cannot
 * interrupt an emergency or an obstacle announcement.
 */
export default function ArduinoConnectionLostNotifier() {
  const { connectionLostReason, clearConnectionLostReason } = useArduino();
  const announcedRef = useRef(null);

  useEffect(() => {
    if (!connectionLostReason || connectionLostReason === announcedRef.current) return;
    announcedRef.current = connectionLostReason;
    speechSpeak(connectionLostReason, { priority: PRIORITY_DEFAULT, language: 'en-US' });
    clearConnectionLostReason();
    announcedRef.current = null;
  }, [connectionLostReason, clearConnectionLostReason]);

  return null;
}
