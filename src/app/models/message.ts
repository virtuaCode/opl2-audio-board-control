export interface Message {
  from: WebMidi.MIDIPort;
  data: Uint8Array;
  time: Date;
}
