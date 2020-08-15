import * as WebMidi from 'webmidi';

export interface Message {
  from: WebMidi.MidiPort;
  data: Uint8Array;
  time: Date;
}
