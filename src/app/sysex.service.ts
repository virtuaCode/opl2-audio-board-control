import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject, combineLatest, fromEventPattern, of, empty, merge, EMPTY } from 'rxjs';
import { map, switchMap, filter } from 'rxjs/operators';
import { Message } from './models/message';
import * as WebMidi from 'webmidi';

export const SOX = 0xF0;
export const VENDOR = 0x7D;
export const EOX = 0xF7;

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

  private access: Subject<WebMidi.WebMidi> = new Subject();
  private output?: WebMidi.Output;
  private outputMessages = new Subject<Message>();
  private input: Subject<WebMidi.Input> = new Subject();
  private instrument = 0;
  private outputAvailable = new BehaviorSubject(false);
  private inputAvailable = new BehaviorSubject(false);


  constructor() { }

  /**
   * Requests the MIDIAccess from the browser
   */
  initMIDI(): Promise<void> {
    if (!WebMidi.default.supported) {
      return Promise.reject(new Error('Your browser does not support the Web MIDI API. Try open the website in Google Chrome.'));
    }

    return new Promise((resolve, reject) => WebMidi.default.enable((err) => {
      if (err) {
        reject(err);
      }

      resolve(this.access.next(WebMidi.default));
    }, true));
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
    return combineLatest([this.getOutputAvailable(), this.getInputAvailable()]).pipe(map(arr => arr.every(a => a)));
  }

  /**
   * Returns a Map of the available MIDIOutputs
   */
  getOutputs(): Observable<Map<string, WebMidi.Output>> {
    return this.access.pipe(map(e => {
      const outputs = new Map<string, WebMidi.Output>();

      for (const o of e.outputs) {
        outputs.set(o.name, o);
      }

      return outputs;
    }));
  }

  /**
   * Returns a Map of the available MIDIInputs
   */
  getInputs(): Observable<Map<string, WebMidi.Input>> {
    return this.access.pipe(map(e => {
      const outputs = new Map<string, WebMidi.Input>();

      for (const i of e.inputs) {
        outputs.set(i.name, i);
      }

      return outputs;
    }));
  }

  /**
   * Sets the active MIDIOutput
   * @param output MIDIOutput
   */
  setOutput(output: WebMidi.Output) {
    this.output = output;
    this.outputAvailable.next(true);
  }

  /**
   * Sets the active MIDIInput
   * @param input MIDIInput
   */
  setInput(input: WebMidi.Input) {
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
      switchMap(input => fromEventPattern<WebMidi.InputEventMidimessage>(
        (handler) => input.addListener('midimessage', 'all', handler),
        (handler) => input.removeListener('midimessage', 'all', handler))),
      map<WebMidi.InputEventMidimessage, Message>(event => {
        return {
          data: event.data,
          from: event.target,
          time: new Date(event.timestamp)
        };
      }));

    return merge(inputMessages, this.outputMessages);
  }

  getSysExMessages() {
    return this.getMIDIMessages().pipe(filter(message => message.data[0] === SOX));
  }

  /**
   * Observable of incoming MIDI response messages
   */
  getResponseMessages() {
    return this.getMIDIMessages().pipe(switchMap(({ data, from }) => {
      if (data[0] === SOX && data[1] === VENDOR && data[data.length - 1] === EOX) {
        // MIDI Message is a SysEx Message

        const [command, param1, param2, instr] = data.slice(2, 6);

        if (command === SYSEX_RESPONSE) {
          // Message is Response
          const decoded = this.decode(data.slice(6, data.length - 1));
          return of(this.dataToInstrument(decoded));
        }
      }

      return EMPTY;
    }));
  }

  /**
   * Sets the current instrument and send instrument request to the current MIDIOutput
   * Also change program to current instrument
   * @param index Index range from 0 to 15
   */
  setInstrument(index: number) {
    this.instrument = Math.max(Math.min(Math.round(index), 15), 0);

    if (this.output) {
      this.sendRequestMessage();
      this.sendProgramMessage(this.instrument);
    }
  }

  /**
   * Sends the attack rate of the given operator
   * @param rate Value between 0 (slowest) and 15 (fastest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendAttackRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for attack rate');
    }

    const offset = operator === Operators.Modulator ? 3 : 9;

    this.sendParameterMessage(offset, 0x0F, rate << 4);
  }

  /**
   * Sends the decay rate of the given operator
   * @param rate Value between 0 (slowest) and 15 (fastest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendDecayRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for decay rate');
    }

    const offset = operator === Operators.Modulator ? 3 : 9;

    this.sendParameterMessage(offset, 0xF0, rate);
  }

  /**
   * Sends the sustain level of the given operator
   * @param level Value between 0 (softest) and 15 (loudest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendSustainLevel(level: number, operator: Operators) {
    if (level < 0x00 || level > 0x0F) {
      throw new Error('Invalid value for sustain level');
    }

    const offset = operator === Operators.Modulator ? 4 : 10;

    this.sendParameterMessage(offset, 0x0F, (0xF - level) << 4);
  }

  /**
   * Sends the release rate of the given operator
   * @param rate Value between 0 (slowest) and 15 (fastest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendReleaseRate(rate: number, operator: Operators) {
    if (rate < 0x00 || rate > 0x0F) {
      throw new Error('Invalid value for release rate');
    }

    const offset = operator === Operators.Modulator ? 4 : 10;

    this.sendParameterMessage(offset, 0xF0, rate);
  }

  /**
   * Sends the sustaining option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendSustaining(enabled: boolean, operator: Operators) {
    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(offset, 0xDF, +enabled << 5);
  }

  /**
   * Sends the envelope scaling option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendEnvelopeScaling(enabled: boolean, operator: Operators) {
    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(offset, 0xEF, +enabled << 4);
  }

  /**
   * Sends the tremolo option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendTremolo(enabled: boolean, operator: Operators) {
    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(offset, 0x7F, +enabled << 7);
  }

  /**
   * Sends the vibrato option of the given operator
   * @param enabled Boolean value: false (off) and true (on)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendVibrato(enabled: boolean, operator: Operators) {
    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(offset, 0xBF, +enabled << 6);
  }

  /**
   * Sends the frequency multiplier of the given operator
   * @param value Value between 0 and 15
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendFrequencyMultiplier(value: number, operator: Operators) {
    if (value < 0x00 || value > 0x0F) {
      throw new Error('Invalid value for frequency multiplier');
    }

    const offset = operator === Operators.Modulator ? 1 : 7;

    this.sendParameterMessage(offset, 0xF0, value);
  }

  /**
   * Sends the modulation feedback factor of the modulator
   * @param factor Value between 0 and 7
   */
  sendFeedbackLevel(factor: number) {
    if (factor < 0x00 || factor > 0x07) {
      throw new Error('Invalid value for modulation feedback factor');
    }

    this.sendParameterMessage(6, 0xF1, factor << 1);
  }

  /**
   * Sends synth mode (Frequency Modulation or Additive synthesis)
   * @param type true (FM) and false (AS)
   */
  sendSynthType(type: boolean) {

    this.sendParameterMessage(6, 0xFE, +(!type));
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
  sendWaveform(waveform: number, operator: Operators) {
    if (waveform < 0x00 || waveform > 0x03) {
      throw new Error('Invalid value for waveform');
    }

    const offset = operator === Operators.Modulator ? 5 : 11;

    this.sendParameterMessage(offset, 0xF8, waveform);
  }

  /**
   * Sends the key scale level of the given operator
   * @param level Value between 0 and 3
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendKeyScaleLevel(level: number, operator: Operators) {
    if (level < 0x00 || level > 0x03) {
      throw new Error('Invalid value for key scale level');
    }

    const offset = operator === Operators.Modulator ? 2 : 8;

    this.sendParameterMessage(offset, 0x3F, level << 6);
  }

  /**
   * Sends the output level of the given operator
   * @param level Value between 0 (softest) and 63 (loudest)
   * @param operator OPL2 Operator (Modulator | Carrier)
   */
  sendOutputLevel(level: number, operator: Operators) {
    if (level < 0x00 || level > 0x3F) {
      throw new Error('Invalid value for output level');
    }

    const offset = operator === Operators.Modulator ? 2 : 8;

    this.sendParameterMessage(offset, 0xC0, 0x3F - level);
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
  sendParameterMessage(offset: number, mask: number, value: number) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const header = [SYSEX_PARAMETER, 0x00, 0x00, this.instrument];
    const data = this.encode([offset, mask, value]);
    const sysexMessage = [...header, ...data];
    const time = WebMidi.default.time;
    this.outputMessages.next({ from: this.output, data: new Uint8Array([SOX, VENDOR, ...sysexMessage, EOX]), time: new Date(time) });
    this.output.sendSysex(VENDOR, sysexMessage);
  }

  /**
   * Sends a request for the stored data of the current instument.
   *
   * @param output MIDIOutput that should receive the message
   */
  sendRequestMessage() {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const header = [SYSEX_REQUEST, 0x00, 0x00, this.instrument];
    const sysexMessage = [...header];
    const time = WebMidi.default.time;
    this.outputMessages.next({ from: this.output, data: new Uint8Array([SOX, VENDOR, ...sysexMessage, EOX]), time: new Date(time) });
    this.output.sendSysex(VENDOR, sysexMessage);
  }

  /**
   * Sends a dump of the current instrument configuration to the MIDIOutput
   *
   * @param output MIDIOutput that should receive the message
   */
  sendDumpMessage(instData: number[], instrument = this.instrument, delay = 0) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    const header = [SYSEX_INSTRUMENT, 0x00, 0x00, instrument];
    const data = this.encode(instData);
    const sysexMessage = [...header, ...data];
    const time = WebMidi.default.time + delay;
    const output = this.output;

    setTimeout(() => {
      this.outputMessages.next({ from: output, data: new Uint8Array([SOX, VENDOR, ...sysexMessage, EOX]), time: new Date(time) });
    }, delay);
    this.output.sendSysex(VENDOR, sysexMessage, { time });
  }


  /**
   * Sends a list of instruments to the MIDIOuput
   *
   * @param instruments List of instruments to send to the MIDIOutput
   */
  sendBank(instruments: Instrument[]) {
    for (let i = 0; i < instruments.length; i++) {
      this.sendDumpMessage(this.instrumentToData(instruments[i]), i, 100 * i);
    }
  }

  /**
   * Sends an instrument to the current selected preset slot
   *
   * @param instrument the instrument
   */
  sendInstrument(instrument: Instrument) {
    this.sendDumpMessage(this.instrumentToData(instrument));
  }

  /**
   * Send Program change to MIDIOutput
   *
   * @param output MIDIOutput that should receive the message
   * @param program Program index
   */
  sendProgramMessage(program: number) {
    if (!this.output) {
      throw new Error('MIDIOutput not set');
    }

    this.output.sendProgramChange(program, 'all');
  }

  /**
   * Creates a new instrument with default configuration
   */
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

  /**
   * Converts register data into an instrument
   *
   * @param data unsigned 8 bit integer array
   */
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
   * Converts an instrument into 8bit register data
   *
   * @param inst the intrument to convert to 8bit register data
   */
  instrumentToData(inst: Instrument): number[] {
    const data = Array<number>(12);

    for (let i = 0; i < data.length; i++) {
      data[i] = 0;
    }

    data[0] ^= inst.drumChannel;
    data[6] ^= inst.feedback << 1;
    data[6] ^= +(!inst.frequencyModulation);

    data[7] ^= +inst.carrier.tremolo << 7;
    data[1] ^= +inst.modulator.tremolo << 7;
    data[7] ^= +inst.carrier.vibrato << 6;
    data[1] ^= +inst.modulator.vibrato << 6;
    data[7] ^= +inst.carrier.sustaining << 5;
    data[1] ^= +inst.modulator.sustaining << 5;
    data[7] ^= +inst.carrier.envelopeScaling << 4;
    data[1] ^= +inst.modulator.envelopeScaling << 4;
    data[7] ^= inst.carrier.frequencyMultiplier;
    data[1] ^= inst.modulator.frequencyMultiplier;
    data[8] ^= inst.carrier.keyScale << 6;
    data[2] ^= inst.modulator.keyScale << 6;
    data[8] ^= (63 - inst.carrier.outputLevel);
    data[2] ^= (63 - inst.modulator.outputLevel);
    data[9] ^= inst.carrier.attack << 4;
    data[3] ^= inst.modulator.attack << 4;
    data[9] ^= inst.carrier.decay;
    data[3] ^= inst.modulator.decay;
    data[10] ^= (15 - inst.carrier.sustain) << 4;
    data[4] ^= (15 - inst.modulator.sustain) << 4;
    data[10] ^= inst.carrier.release;
    data[4] ^= inst.modulator.release;
    data[11] ^= inst.carrier.waveform;
    data[5] ^= inst.modulator.waveform;

    return data;
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
    const encoded = [0];

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
