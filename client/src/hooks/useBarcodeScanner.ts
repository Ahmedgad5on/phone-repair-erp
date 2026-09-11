import { useEffect, useRef } from 'react';
import { soundEffects } from '../utils/soundEffects';

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minChars?: number;
  maxIntervalMs?: number;
}

/**
 * Global HID Barcode Scanner Interceptor (Hardware Proposal 51)
 * Distinguishes physical laser/CCD scanner rapid keystrokes (< 50ms) from human typing.
 */
export function useBarcodeScanner({ onScan, minChars = 3, maxIntervalMs = 50 }: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional hotkeys
      if (e.key.startsWith('F') || e.ctrlKey || e.altKey || e.metaKey) return;

      const currentTime = Date.now();
      const interval = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // When Enter is pressed
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minChars) {
          e.preventDefault();
          const scannedCode = bufferRef.current.trim();
          bufferRef.current = '';
          soundEffects.playBarcodeBeep();
          onScan(scannedCode);
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // If interval between keys is larger than threshold, reset buffer (human typing)
      if (interval > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Accumulate standard printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan, minChars, maxIntervalMs]);
}
