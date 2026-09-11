// Desktop & Browser Hardware Peripheral Integration Service
// Supports WebSerial (Multimeters/Power-Z/BMS), WebUSB/ESC-POS, and HID Barcode Scanners

export interface SerialDeviceInfo {
  portName?: string;
  baudRate: number;
  connected: boolean;
}

export interface BootAmperageSample {
  timestamp: number;
  voltage: number;
  amperage: number;
  power: number;
}

class HardwarePeripheralService {
  private serialPort: any = null;
  private reader: any = null;
  private isReadingSerial = false;
  private barcodeBuffer: string = '';
  private lastKeyTime: number = 0;
  private barcodeListeners: ((barcode: string) => void)[] = [];

  constructor() {
    this.initBarcodeInterceptor();
  }

  // 1. Global HID Barcode Scanner Interceptor (Keyboard Emulation filter)
  private initBarcodeInterceptor() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea';

      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastKeyTime;
      this.lastKeyTime = currentTime;

      // Barcode scanners type rapidly (< 35ms between keystrokes)
      if (e.key === 'Enter') {
        if (this.barcodeBuffer.length >= 4) {
          const code = this.barcodeBuffer.trim();
          this.notifyBarcodeScanned(code);
          this.barcodeBuffer = '';
          if (!isInput) {
            e.preventDefault();
          }
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 80 && this.barcodeBuffer.length > 0) {
          this.barcodeBuffer = '';
        }
        this.barcodeBuffer += e.key;
      }
    });
  }

  onBarcodeScanned(callback: (barcode: string) => void) {
    this.barcodeListeners.push(callback);
    return () => {
      this.barcodeListeners = this.barcodeListeners.filter(cb => cb !== callback);
    };
  }

  private notifyBarcodeScanned(barcode: string) {
    console.log(`[Hardware] Barcode Gun Scanned: ${barcode}`);
    this.barcodeListeners.forEach(cb => {
      try {
        cb(barcode);
      } catch (err) {
        console.error('[Hardware] Error in barcode listener', err);
      }
    });
  }

  // 2. WebSerial API for Digital Multimeters (FNIRSI / POWER-Z / QianLi / JCID)
  async connectSerialPowerSupply(
    onData: (sample: BootAmperageSample) => void,
    baudRate: number = 115200
  ): Promise<{ success: boolean; message: string }> {
    if (typeof navigator === 'undefined' || !(navigator as any).serial) {
      return { success: false, message: 'WebSerial is not supported on this browser or platform.' };
    }

    try {
      this.serialPort = await (navigator as any).serial.requestPort();
      await this.serialPort.open({ baudRate });
      this.isReadingSerial = true;
      this.readSerialLoop(onData);
      return { success: true, message: 'Connected to diagnostic serial meter.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to connect serial port.' };
    }
  }

  private async readSerialLoop(onData: (sample: BootAmperageSample) => void) {
    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      let accumulated = '';
      while (this.isReadingSerial) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          accumulated += value;
          const lines = accumulated.split('\n');
          accumulated = lines.pop() || '';
          for (const line of lines) {
            const parsed = this.parseMeterLine(line.trim());
            if (parsed) onData(parsed);
          }
        }
      }
      await readableStreamClosed.catch(() => {});
    } catch (e) {
      console.warn('[Hardware] Serial stream closed or failed', e);
    }
  }

  private parseMeterLine(line: string): BootAmperageSample | null {
    const match = line.match(/([0-9.]+)[,\s]+([0-9.]+)/);
    if (match) {
      const voltage = parseFloat(match[1]);
      const amperage = parseFloat(match[2]);
      return {
        timestamp: Date.now(),
        voltage,
        amperage,
        power: Number((voltage * amperage).toFixed(3))
      };
    }
    return null;
  }

  async disconnectSerial(): Promise<void> {
    this.isReadingSerial = false;
    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
    }
  }

  generateDrawerKickCommand(): Uint8Array {
    return new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  }
}

export const hardwareService = new HardwarePeripheralService();
