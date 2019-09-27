import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { sprintf } from 'sprintf-js';


export const SOX = [0xF0, 0x7D];
export const EOX = [0xF7];

export enum Operators {
  Modulator,
  Carrier
}

@Injectable({
  providedIn: 'root'
})
export class SysexService {

  private access: Subject<WebMidi.MIDIAccess> = new Subject();
  private outputDevice?: WebMidi.MIDIOutput;
  private instrument = 0;
  private outputDeviceAvailable = new BehaviorSubject(false);

  constructor() { }

  /**
   * Requests the MIDIAccess from the browser
   */
  initMIDI(): Promise<void> {
    return navigator.requestMIDIAccess({ sysex: true }).then(access => this.access.next(access));
  }

  /**
   * Returns a Map of the available MIDIOutputs
   */
  getOutputDevices(): Observable<Map<string, WebMidi.MIDIOutput>> {
    return this.access.pipe(map(e => e.outputs));
  }

  /**
   * Sets the active MIDIOutput
   * @param output MIDIOutput
   */
  setOutputDevice(output: WebMidi.MIDIOutput) {
    this.outputDevice = output;
    this.outputDeviceAvailable.next(true);
  }
  /**
   * Returns the current selected intrument
   */

  getInstument() {
    return this.instrument;
  }

  /**
   * Sets the current Instrument
   * @param index Index range from 0 to 15
   */

  setInstrument(index: number) {
    this.instrument = Math.max(Math.min(Math.round(index), 15), 0);
  }

  /**
   * Sends the attack rate of the given operator
   * @param rate Value between 0 (shortest) and 15 (longest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendAttackRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for attack rate');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 3 : 9;

    this.sendParameterMessage(this.outputDevice, offset, 0x0F,  (~rate & 0xF) << 4);
  }

  /**
   * Sends the decay rate of the given operator
   * @param rate Value between 0 (shortest) and 15 (longest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendDecayRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for decay rate');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 3 : 9;

    this.sendParameterMessage(this.outputDevice, offset, 0x0F, (~rate & 0xF));
  }

  /**
   * Sends the sustain level of the given operator
   * @param level Value between 0 (softest) and 15 (loudest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendSustainLevel(level: number, operator: Operators) {
    if (level < 0x00 || level > 0x0F) {
      throw new Error('Invalid value for sustain level');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 4 : 10;

    this.sendParameterMessage(this.outputDevice, offset, 0xF0, (~level & 0xF) << 4);
  }

  /**
   * Sends the release rate of the given operator
   * @param level Value between 0 (shortest) and 15 (longest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendReleaseRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for release rate');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 4 : 10;

    this.sendParameterMessage(this.outputDevice, offset, 0x0F, (~rate & 0xF));
  }

  /**
   * Sends the sustaining option of the given operator
   * @param level Value between 0 (off) and 1 (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendSustaining(value: number, operator: Operators) {
    if (value < 0x00 || value > 0x01) {
      throw new Error('Invalid value for sustaining');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.outputDevice, offset, 0xDF, value << 5);
  }

  /**
   * Sends the envelope scaling option of the given operator
   * @param level Value between 0 (off) and 1 (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendEnvelopeScaling(value: number, operator: Operators) {
    if (value < 0x00 || value > 0x01) {
      throw new Error('Invalid value for envelope scaling');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.outputDevice, offset, 0xEF, value << 4);
  }

  /**
   * Sends the output level of the given operator
   * @param level Value between 0 (softest) and 63 (loudest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendOutputLevel(level: number, operator: Operators) {
    if (level < 0x00 || level > 0x3F) {
      throw new Error('Invalid value for output level');
    }

    if (!this.outputDevice) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 2 : 8;

    this.sendParameterMessage(this.outputDevice, offset, 0xC0, 0x3F - level);
  }

  getDeviceAvailable() {
    return this.outputDeviceAvailable.asObservable();
  }

  /**
   * Sends a parameter value to the a MIDI device for the current instrument slot. 
   * 
   *  The updated value at the audio board will equal: `(<RegisterValue> & mask) | value`
   * 
   * @param output MIDIOutput that should receive the message
   * @param offset offset in the intrument data byte array
   * @param mask the bits which won't get overriden
   * @param value the bits for the new value
   */
  sendParameterMessage(output: WebMidi.MIDIOutput, offset: number, mask: number, value: number) {
    const header = [0x01, 0x00, 0x00, this.instrument];
    const data = this.encode([offset, mask, value]);
    const sysexMessage = [...SOX, ...header, ...data, ...EOX];
    console.log('Sending data: ' + sysexMessage.map(e => sprintf('%02X', e)).join(' '));
    output.send(sysexMessage);
  }


  /**
   * The 8-bit file data needs to be converted to 7-bit form, with the result that 
   * every 7 bytes of file data translates to 8 bytes in the MIDI stream. For each 
   * group of 7 bytes (of file data) the top bit from each is used to construct an 
   * eigth byte, which is sent first. 
   * 
   * plain:
   * AAAAaaaa BBBBbbbb CCCCcccc DDDDdddd EEEEeeee FFFFffff GGGGgggg
   * 
   * encoded:
   * 0ABCDEFG 0AAAaaaa 0BBBbbbb 0CCCcccc 0DDDdddd 0EEEeeee 0FFFffff 0GGGgggg
   * 
   * The final group may have less than 7 bytes, and is coded as follows 
   * (e.g. with * 3 bytes in the final group):
   * 0ABC0000 0AAAaaaa 0BBBbbbb 0CCCcccc 
   * 
   * @param data the byte array that should get encoded
   */
  encode(data: number[]): number[] {
    let outLength = 0;
    let count = 0;
    let ptr = 0;
    let encoded = [0];

    for (const byte of data) {
      const msb = byte >> 7;
      const body = byte & 0x7f;

      encoded[0 + ptr] |= (msb << (6 - count));
      encoded[1 + count + ptr] = body;


      if (count++ === 6) {
        ptr += 8;
        outLength += 8;
        encoded[ptr] = 0;
        count = 0;
      }
    }
    const len = outLength + count + (count > 0 ? 1 : 0);
    return encoded.slice(0, len);
  }

}
