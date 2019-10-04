import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject, combineLatest, fromEvent, of, empty, merge } from 'rxjs';
import { map, switchMap, filter } from 'rxjs/operators';
import { EventTargetLike } from 'rxjs/internal/observable/fromEvent';
import { Message } from './models/message';


export const SOX = [0xF0, 0x7D];
export const EOX = [0xF7];

export const SYSEX_INSTRUMENT = 0x00;
export const SYSEX_PARAMETER = 0x01;
export const SYSEX_REQUEST = 0x02;
export const SYSEX_RESPONSE = 0x03;

export enum Operators {
  Modulator,
  Carrier
}

@Injectable({
  providedIn: 'root'
})
export class SysexService {

  private access: Subject<WebMidi.MIDIAccess> = new Subject();
  private output?: WebMidi.MIDIOutput;
  private outputMessages = new Subject<Message>();
  private input: Subject<WebMidi.MIDIInput> = new Subject();
  private instrument = 0;
  private outputAvailable = new BehaviorSubject(false);
  private inputAvailable = new BehaviorSubject(false);


  constructor() { }

  /**
   * Requests the MIDIAccess from the browser
   */
  initMIDI(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      return Promise.reject(new Error('Your browser does not support the Web MIDI API. Try open the website in Google Chrome.'));
    }

    return navigator.requestMIDIAccess({ sysex: true }).then(access => this.access.next(access));
  }

  /**
   * Returns a observable which returns true when the MIDIOutput is available
   */
  getOutputAvailable() {
    return this.outputAvailable.asObservable();
  }

  /**
   * Returns a observable which returns true when the MIDIInput is available
   */
  getInputAvailable() {
    return this.inputAvailable.asObservable();
  }

  /**
   * Returns a observable which returns true when both the MIDIOutput and MIDIInput are available
   */
  getInputOutputAvailable() {
    return combineLatest(this.getOutputAvailable(), this.getInputAvailable(), (o1, o2) => o1 && o2);
  }

  /**
   * Returns a Map of the available MIDIOutputs
   */
  getOutputs(): Observable<Map<string, WebMidi.MIDIOutput>> {
    return this.access.pipe(map(e => e.outputs));
  }

  /**
   * Returns a Map of the available MIDIInputs
   */
  getInputs(): Observable<Map<string, WebMidi.MIDIInput>> {
    return this.access.pipe(map(e => e.inputs));
  }

  /**
   * Sets the active MIDIOutput
   * @param output MIDIOutput
   */
  setOutput(output: WebMidi.MIDIOutput) {
    this.output = output;
    this.outputAvailable.next(true);
  }

  /**
   * Sets the active MIDIInput
   * @param input MIDIInput
   */
  setInput(input: WebMidi.MIDIInput) {
    this.input.next(input);
    this.inputAvailable.next(true);
  }

  /**
   * Returns the current selected intrument
   */
  getInstument() {
    return this.instrument;
  }

  /**
   * Observable of incoming MIDI messages
   */
  getMIDIMessages() {
    const inputMessages = this.input.pipe(
      switchMap(input => fromEvent(input as EventTargetLike<WebMidi.MIDIMessageEvent>, 'midimessage')),
      map<WebMidi.MIDIMessageEvent, Message>(event => {
        return {
          data: event.data,
          from: event.currentTarget as WebMidi.MIDIPort,
          time: new Date(event.timeStamp)
        };
      }));

    return merge(inputMessages, this.outputMessages);
  }

  getSysExMessages() {
    return this.getMIDIMessages().pipe(filter(message => message.data[0] === SOX[0]));
  }

  /**
   * Observable of incoming MIDI response messages
   */
  getResponseMessages() {
    return this.getMIDIMessages().pipe(switchMap(({ data, from }) => {
      if (data[0] === SOX[0] && data[1] === SOX[1] && data[data.length - 1] === EOX[0]) {
        // MIDI Message is a SysEx Message

        const [command, param1, param2, instr] = data.slice(2, 6);

        if (command === SYSEX_RESPONSE) {
          // Message is Response

          const decoded = this.decode(data.slice(6, data.length - 1));
          return of(this.dataToInstrument(decoded));
        }
      }

      return empty();
    }));
  }

  /**
   * Sets the current Instrument and send instrument request to the current MIDIOutput
   * @param index Index range from 0 to 15
   */

  setInstrument(index: number) {
    this.instrument = Math.max(Math.min(Math.round(index), 15), 0);

    if (this.output) {
      this.sendRequestMessage(this.output);
    }
  }

  /**
   * Sends the attack rate of the given operator
   * @param rate Value between 0 (slowest) and 15 (fastest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendAttackRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for attack rate');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 3 : 9;

    this.sendParameterMessage(this.output, offset, 0x0F, rate << 4);
  }

  /**
   * Sends the decay rate of the given operator
   * @param rate Value between 0 (slowest) and 15 (fastest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendDecayRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for decay rate');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 3 : 9;

    this.sendParameterMessage(this.output, offset, 0xF0, rate);
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

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 4 : 10;

    this.sendParameterMessage(this.output, offset, 0x0F, (0xF - level) << 4);
  }

  /**
   * Sends the release rate of the given operator
   * @param rate Value between 0 (slowest) and 15 (fastest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendReleaseRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for release rate');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 4 : 10;

    this.sendParameterMessage(this.output, offset, 0xF0, rate);
  }

  /**
   * Sends the sustaining option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendSustaining(enabled: boolean, operator: Operators) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.output, offset, 0xDF, +enabled << 5);
  }

  /**
   * Sends the envelope scaling option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendEnvelopeScaling(enabled: boolean, operator: Operators) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.output, offset, 0xEF, +enabled << 4);
  }

  /**
   * Sends the tremolo option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendTremolo(enabled: boolean, operator: Operators) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.output, offset, 0x7F, +enabled << 7);
  }

  /**
   * Sends the vibrato option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendVibrato(enabled: boolean, operator: Operators) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.output, offset, 0xBF, +enabled << 6);
  }

  /**
   * Sends the frequency multiplier of the given operator
   * @param value Value between 0 and 15
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendFrequencyMultiplier(value: number, operator: Operators) {
    if (value < 0x00 || value > 0x0F) {
      throw new Error('Invalid value for frequency multiplier');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(this.output, offset, 0xF0, value);
  }

  /**
   * Sends the modulation feedback factor of the modulator
   * @param factor Value between 0 and 7
   */
  async sendFeedbackLevel(factor: number) {
    if (factor < 0x00 || factor > 0x07) {
      throw new Error('Invalid value for modulation feedback factor');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    this.sendParameterMessage(this.output, 6, 0xF1, factor << 1);
  }

  /**
   * Sends synth mode (Frequency Modulation or Additive synthesis)
   * @param type true (FM) and false (AS)
   */
  async sendSynthType(type: boolean) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    this.sendParameterMessage(this.output, 6, 0xFE, +(!type));
  }

  /**
   * Sends the waveform of the given operator
   * @example 
   *      0          1         2          3    
   *   /\         /\        /\  /\     /|  /|  
   *  /  \       /  \___   /  \/  \   / |_/ |_ 
   *      \  /                                 
   *       \/                                  
   *
   * @param waveform Value between 0 and 3
   */
  async sendWaveform(waveform: number, operator: Operators) {
    if (waveform < 0x00 || waveform > 0x03) {
      throw new Error('Invalid value for waveform');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 5 : 11;

    this.sendParameterMessage(this.output, offset, 0xF8, waveform);
  }

  /**
   * Sends the key scale level of the given operator
   * @param level Value between 0 and 3
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  async sendKeyScaleLevel(level: number, operator: Operators) {
    if (level < 0x00 || level > 0x03) {
      throw new Error('Invalid value for key scale level');
    }

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 2 : 8;

    this.sendParameterMessage(this.output, offset, 0x3F, level << 6);
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

    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const offset = operator === Operators.Modulator ? 2 : 8;

    this.sendParameterMessage(this.output, offset, 0xC0, 0x3F - level);
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
    const header = [SYSEX_PARAMETER, 0x00, 0x00, this.instrument];
    const data = this.encode([offset, mask, value]);
    const sysexMessage = [...SOX, ...header, ...data, ...EOX];
    this.outputMessages.next({ from: output, data: new Uint8Array(sysexMessage), time: new Date() });
    output.send(sysexMessage);
  }

  /**
   * Sends a request for the stored data of the current instument.
   *
   * @param output MIDIOutput that should receive the message
   */

  sendRequestMessage(output: WebMidi.MIDIOutput) {
    const header = [SYSEX_REQUEST, 0x00, 0x00, this.instrument];
    const sysexMessage = [...SOX, ...header, ...EOX];
    this.outputMessages.next({ from: output, data: new Uint8Array(sysexMessage), time: new Date() });
    output.send(sysexMessage);
  }

  getDefaultInstrument(): Instrument {
    return {
      drumChannel: 0,
      feedback: 0,
      frequencyModulation: false,
      modulator: {
        tremolo: false,
        vibrato: false,
        sustaining: false,
        envelopeScaling: false,
        frequencyMultiplier: 0,
        keyScale: 0,
        outputLevel: 0,
        attack: 0,
        decay: 0,
        sustain: 0,
        release: 0,
        waveform: 0,
      },
      carrier: {
        tremolo: false,
        vibrato: false,
        sustaining: false,
        envelopeScaling: false,
        frequencyMultiplier: 0,
        keyScale: 0,
        outputLevel: 0,
        attack: 0,
        decay: 0,
        sustain: 0,
        release: 0,
        waveform: 0,
      }
    };
  }

  dataToInstrument(data: number[]): Instrument {
    return {
      drumChannel: data[0],
      feedback: (data[6] & 0x0E) >> 1,
      frequencyModulation: !(data[6] & 0x01),
      modulator: {
        tremolo: !!((data[1] & 0x80) >> 7),
        vibrato: !!((data[1] & 0x40) >> 6),
        sustaining: !!((data[1] & 0x20) >> 5),
        envelopeScaling: !!((data[1] & 0x10) >> 4),
        frequencyMultiplier: data[1] & 0x0F,
        keyScale: (data[2] & 0xC0) >> 6,
        outputLevel: 0x3F - (data[2] & 0x3F),
        attack: (data[3] & 0xF0) >> 4,
        decay: data[3] & 0x0F,
        sustain: 0xF - ((data[4] & 0xF0) >> 4),
        release: data[4] & 0x0F,
        waveform: data[5] & 0x03,
      },
      carrier: {
        tremolo: !!((data[7] & 0x80) >> 7),
        vibrato: !!((data[7] & 0x40) >> 6),
        sustaining: !!((data[7] & 0x20) >> 5),
        envelopeScaling: !!((data[7] & 0x10) >> 4),
        frequencyMultiplier: data[7] & 0x0F,
        keyScale: (data[8] & 0xC0) >> 6,
        outputLevel: 0x3F - (data[8] & 0x3F),
        attack: (data[9] & 0xF0) >> 4,
        decay: data[9] & 0x0F,
        sustain: 0xF - ((data[10] & 0xF0) >> 4),
        release: data[10] & 0x0F,
        waveform: data[11] & 0x03,
      }
    };
  }


  /**
   * The 8-bit file data needs to be converted to 7-bit form, with the result that 
   * every 7 bytes of file data translates to 8 bytes in the MIDI stream. For each 
   * group of 7 bytes (of file data) the top bit from each is used to construct an 
   * eigth byte, which is sent first. 
   * 
   * plain:
   * `AAAAaaaa BBBBbbbb CCCCcccc DDDDdddd EEEEeeee FFFFffff GGGGgggg`
   * 
   * encoded:
   * `0ABCDEFG 0AAAaaaa 0BBBbbbb 0CCCcccc 0DDDdddd 0EEEeeee 0FFFffff 0GGGgggg`
   * 
   * The final group may have less than 7 bytes, and is coded as follows 
   * (e.g. with * 3 bytes in the final group):
   * `0ABC0000 0AAAaaaa 0BBBbbbb 0CCCcccc`
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


  /**
   * Decodes SysEx MIDI Message data
   * @param data the byte array that should get decoded
   */
  decode(data: Uint8Array): number[] {
    let count = 0;
    let msbStorage = 0;
    let byteIndex = 0;

    const outData: number[] = [];

    for (let i = 0; i < data.length; i++) {
      if ((i % 8) === 0) {
        msbStorage = data[i];
        byteIndex = 6;
      } else {
        const body = data[i];
        const msb = ((msbStorage >> byteIndex--) & 1) << 7;
        outData[count++] = msb | body;
      }
    }
    return outData;
  }
}
