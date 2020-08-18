import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Operators, SysexService } from './sysex.service';
import { FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as WebMidi from 'webmidi';
import './models/instrument';
import './models/message';
import './models/operator';
import { WoplService } from './wopl.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {

  @ViewChild('textArea')
  textArea?: ElementRef<HTMLTextAreaElement>;

  @ViewChild('dialog')
  dialog?: ElementRef<HTMLDialogElement>;

  Operators = Operators;

  outputControl = new FormControl();
  inputControl = new FormControl();
  instrumentControl = new FormControl({ value: 0, disabled: true });

  outputs: { [key: string]: WebMidi.Output } = {};
  inputs: { [key: string]: WebMidi.Input } = {};
  outputsSub?: Subscription;
  inputsSub?: Subscription;
  selectOutputSub?: Subscription;
  selectInputSub?: Subscription;
  midiEventSub?: Subscription;
  instrumentSub?: Subscription;
  availableSub?: Subscription;
  midiMessageSub?: Subscription;

  errors: any[] = [];
  banks: { [key: string]: [string, Instrument][] } = {};
  instruments: number[] = Array.from(new Array(16), (e, i) => i);
  instrument: Instrument = this.sysex.getDefaultInstrument();
  instrumentIndex = 0;
  selectedInstruments?: Instrument[];
  midiLogValue = '';

  constructor(
    private readonly sysex: SysexService,
    private readonly wopl: WoplService,
    private readonly ref: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.sysex.initMIDI().catch(this.errorHandler.bind(this));

    this.outputsSub = this.sysex.getOutputs().subscribe(map => {
      this.outputs = this.mapToObject<WebMidi.Output>(map);
      console.log(this.outputs);
    });

    this.inputsSub = this.sysex.getInputs().subscribe(map => {
      this.inputs = this.mapToObject<WebMidi.Input>(map);
      console.log(this.inputs);
    });

    this.selectOutputSub = this.outputControl.valueChanges.subscribe(key => {
      this.sysex.setOutput(this.outputs[key]);
    });

    this.selectInputSub = this.inputControl.valueChanges.subscribe(key => {
      this.sysex.setInput(this.inputs[key]);
    });

    this.availableSub = this.deviceAvailable.subscribe((available) => {
      if (available) {
        this.instrumentControl.enable();
        this.sysex.sendRequestMessage();
      } else {
        this.instrumentControl.disable({ emitEvent: false });
      }
    });

    /*this.instrumentSub = this.instrumentControl.valueChanges.subscribe(value => {
      this.sysex.setInstrument(value);
    });*/

    this.midiEventSub = this.sysex.getResponseMessages().subscribe(instrument => {
      this.instrument = instrument;
    });

    this.midiMessageSub = this.sysex.getSysExMessages().subscribe(({ from, time, data }) => {
      const h = time.getHours().toString().padStart(2, '0');
      const m = time.getMinutes().toString().padStart(2, '0');
      const s = time.getSeconds().toString().padStart(2, '0');
      const ms = time.getMilliseconds().toString().padStart(3, '0');

      this.midiLogValue += `${h}:${m}:${s}.${ms}`;
      this.midiLogValue += `[${from.type === 'input' ? 'Input' : 'Output'}]\t`;
      this.midiLogValue += Array.from(data).map(i => i.toString(16).padStart(2, '0')).join(' ');
      this.midiLogValue += '\n';

      this.ref.detectChanges();
      if (this.textArea) {
        this.textArea.nativeElement.scrollTop = this.textArea.nativeElement.scrollHeight;
      }
    });
  }

  ngOnDestroy() {
    if (this.outputsSub) {
      this.outputsSub.unsubscribe();
    }

    if (this.inputsSub) {
      this.inputsSub.unsubscribe();
    }

    if (this.midiEventSub) {
      this.midiEventSub.unsubscribe();
    }

    if (this.selectInputSub) {
      this.selectInputSub.unsubscribe();
    }

    if (this.selectOutputSub) {
      this.selectOutputSub.unsubscribe();
    }

    if (this.midiMessageSub) {
      this.midiMessageSub.unsubscribe();
    }
  }

  get deviceAvailable() {
    return this.sysex.getInputOutputAvailable();
  }

  get numSelected(): number {
    return (this.selectedInstruments || []).length;
  }

  openDialog() {
    if (this.dialog) {
      this.dialog.nativeElement.showModal();
    }
  }

  async onOpenBank(files: File[]) {
    const file = files[0];
    try {
      this.banks = await this.wopl.parseWOPL(file);
      this.openDialog();
      this.selectedInstruments = [];
    } catch (error) {
      this.errorHandler(error);
    }
  }

  onImport() {
    if (this.selectedInstruments) {
      this.sysex.sendBank(this.selectedInstruments);
    }

    if (this.dialog) {
      this.dialog.nativeElement.close();
    }
  }

  onCancel() {
    if (this.dialog) {
      this.dialog.nativeElement.close();
    }
  }

  onInstrumentChange(num: number) {
    this.sysex.setInstrument(num);
    this.instrumentIndex = num;
  }

  onInstrumentSelected(event: any) {
    if (!this.banks) {
      return;
    }

    const selected = Array.from<HTMLOptionElement>(event.target.selectedOptions).map((o: HTMLOptionElement) => {
      return [(o.parentNode as HTMLOptGroupElement).label, Number.parseInt(o.value, 10)] as [string, number];
    });

    const instruments: Instrument[] = [];

    for (const [key, index] of selected) {
      instruments.push(this.banks[key][index][1]);
    }

    this.selectedInstruments = instruments;
  }

  onAttackRateChange(value: number, op: Operators) {
    try {
      this.sysex.sendAttackRate(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onDecayRateChange(value: number, op: Operators) {
    try {
      this.sysex.sendDecayRate(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onSustainLevelChange(value: number, op: Operators) {
    try {
      this.sysex.sendSustainLevel(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onReleaseRateChange(value: number, op: Operators) {
    try {
      this.sysex.sendReleaseRate(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onSustainingChange(value: boolean, op: Operators) {
    try {
      this.sysex.sendSustaining(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onFrequenceMultiplierChange(value: number, op: Operators) {
    try {
      this.sysex.sendFrequencyMultiplier(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onModulationFeedbackChange(value: number) {
    try {
      this.sysex.sendFeedbackLevel(value);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onKeyScaleLevelChange(value: number, op: Operators) {
    try {
      this.sysex.sendKeyScaleLevel(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onSynthModeChange(value: boolean) {
    try {
      this.sysex.sendSynthType(value);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onWaveformChange(value: number, op: Operators) {
    try {
      this.sysex.sendWaveform(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onEnvelopeScalingChange(value: boolean, op: Operators) {
    try {
      this.sysex.sendEnvelopeScaling(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onVibratoChange(value: boolean, op: Operators) {
    try {
      this.sysex.sendVibrato(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onTremoloChange(value: boolean, op: Operators) {
    try {
      this.sysex.sendTremolo(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  onOutputLevelChange(value: number, op: Operators) {
    try {
      this.sysex.sendOutputLevel(value, op);
    } catch (err) {
      this.errorHandler(err);
    }
  }

  removeError(error: any) {
    this.errors = this.errors.filter(e => e !== error);
  }

  mapFrequenceMultiplier(val: number) {
    return val === 0 ? 0.5 : val;
  }

  mapFeedback(val: number) {
    const feedback = [
      '0',
      '1/16',
      '1/8',
      '1/4',
      '1/2',
      '1',
      '2',
      '4'
    ];

    return feedback[val];
  }

  private errorHandler(error: any) {
    this.errors = [error, ...this.errors];
  }

  private mapToObject<T>(map: Map<string, T>): { [key: string]: T } {
    return Array.from(map.entries())
      .reduce((main, [key, value]) => ({ ...main, [key]: value }), {});
  }
}
