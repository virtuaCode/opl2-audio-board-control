import { Injectable } from '@angular/core';
import { SysexService } from './sysex.service';
import { GM_INSTRUMENTS } from './gm-instruments';

@Injectable({
  providedIn: 'root'
})
export class WoplService {

  constructor(private readonly sysex: SysexService) { }

  async parseWOPL(file: File) {
    const decoder = new TextDecoder('ascii');
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    const magicNumber = decoder.decode(buffer.slice(0, 11));

    if (magicNumber !== 'WOPL3-BANK\0') {
      throw new Error('File is not a WOPL3-BANK (incorrect magic number)');
    }

    const version = view.getUint16(11, true);

    const insSize = version > 2 ? 66 : 62;

    const mbanks = view.getUint16(13);
    const pbanks = view.getUint16(15);

    const flags = view.getUint8(17); // can be ignored
    const model = view.getUint8(18); // can be ignored

    const melodicBanks: { [key: string]: [string, Instrument][] } = {};

    const mbanksNames = [];

    if (version >= 2) {
      // bank meta data
      for (let i = 0; i < mbanks; i++) {
        const bankname = decoder.decode(buffer.slice(19, 19 + 32)).replace(/\0/g, '');
        mbanksNames.push(`[${i + 1}] ${bankname.length > 0 ? bankname : 'Unnamed Bank'}`);
      }
    } else {
      for (let i = 1; i <= mbanks; i++) {
        mbanksNames.push(`[${i}] Unnamed Bank`);
      }
    }

    const offset = 19 + (version >= 2 ? 34 * (mbanks + pbanks) : 0);

    for (let i = 0; i < mbanks; i++) {
      const bank: [string, Instrument][] = [];
      const bankOffset = insSize * 128 * i + offset;

      for (let pos = 0; pos < 128; pos++) {
        const instOffset = bankOffset + insSize * pos;
        let name = decoder.decode(buffer.slice(instOffset, 32 + instOffset)).replace(/\0/g, '');

        if (name.length === 0) {
          name = `* ${GM_INSTRUMENTS[pos]}`;
        }

        const modes = view.getUint8(instOffset + 39);
        const fourOperators = !!(modes & 0x01);
        const pseudoOperators = !!((modes & 0x02) >> 1);
        const blankInstrument = !!(modes & 0x04 >> 2);

        if (fourOperators || pseudoOperators || blankInstrument) {
          // opl2 can not support these modes
          continue;
        }

        const feedbackConnection = view.getUint8(instOffset + 40);

        const carrier: number[] = [];
        for (let o = 0; o < 5; o++) {
          carrier.push(view.getUint8(instOffset + 42 + o));
        }

        const modulator: number[] = [];
        for (let o = 0; o < 5; o++) {
          modulator.push(view.getUint8(instOffset + 47 + o));
        }




        bank.push([name, this.sysex.dataToInstrument([0x00, ...modulator, feedbackConnection, ...carrier])]);
      }

      melodicBanks[mbanksNames[i]] = bank;
    }

    return melodicBanks;
  }
}
