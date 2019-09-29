import { Component, OnInit, OnDestroy } from '@angular/core';
import { Operators, SysexService } from './sysex.service';
import { FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {

  Operators = Operators;

  outputControl = new FormControl();
  inputControl = new FormControl();
  instrumentControl = new FormControl({ value: 0, disabled: true });

  outputs: { [key: string]: WebMidi.MIDIOutput } = {};
  inputs: { [key: string]: WebMidi.MIDIInput } = {};
  outputsSub?: Subscription;
  inputsSub?: Subscription;
  selectOutputSub?: Subscription;
  selectInputSub?: Subscription;
  midiEventSub?: Subscription;
  instrumentSub?: Subscription;
  availableSub?: Subscription;

  errors: any[] = [];
  instruments: number[] = Array.from(new Array(16), (e, i) => i);
  instrument: Instrument = this.sysex.getDefaultInstrument();

  constructor(private readonly sysex: SysexService) { }

  ngOnInit(): void {
    this.sysex.initMIDI().catch(this.errorHandler.bind(this));

    this.outputsSub = this.sysex.getOutputs().subscribe(map => {
      this.outputs = this.mapToObject<WebMidi.MIDIOutput>(map);
    });

    this.inputsSub = this.sysex.getInputs().subscribe(map => {
      this.inputs = this.mapToObject<WebMidi.MIDIInput>(map);
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
      } else {
        this.instrumentControl.disable({emitEvent: false});
      }
    });

    this.instrumentSub = this.instrumentControl.valueChanges.subscribe(value => {
      this.sysex.setInstrument(value);
    });

    this.midiEventSub = this.sysex.getResponseMessages().subscribe(instrument => {
      this.instrument = instrument;
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
  }

  get deviceAvailable() {
    return this.sysex.getInputOutputAvailable();
  }

  onAttackRateChange(value: number, op: Operators) {
    this.sysex.sendAttackRate(value, op).catch(this.errorHandler.bind(this));
  }

  onDecayRateChange(value: number, op: Operators) {
    this.sysex.sendDecayRate(value, op).catch(this.errorHandler.bind(this));
  }

  onSustainLevelChange(value: number, op: Operators) {
    this.sysex.sendSustainLevel(value, op).catch(this.errorHandler.bind(this));
  }

  onReleaseRateChange(value: number, op: Operators) {
    this.sysex.sendReleaseRate(value, op).catch(this.errorHandler.bind(this));
  }

  onSustainingChange(value: boolean, op: Operators) {
    this.sysex.sendSustaining(value, op).catch(this.errorHandler.bind(this));
  }

  onFrequenceMultiplierChange(value: number, op: Operators) {
    this.sysex.sendFrequencyMultiplier(value, op).catch(this.errorHandler.bind(this));
  }

  onModulationFeedbackChange(value: number) {
    this.sysex.sendFeedbackLevel(value).catch(this.errorHandler.bind(this));
  }

  onKeyScaleLevelChange(value: number, op: Operators) {
    this.sysex.sendKeyScaleLevel(value, op).catch(this.errorHandler.bind(this));
  }

  onSynthModeChange(value: boolean) {
    this.sysex.sendSynthType(value).catch(this.errorHandler.bind(this));
  }

  onWaveformChange(value: number, op: Operators) {
    this.sysex.sendWaveform(value, op).catch(this.errorHandler.bind(this));
  }

  onEnvelopeScalingChange(value: boolean, op: Operators) {
    this.sysex.sendEnvelopeScaling(value, op).catch(this.errorHandler.bind(this));
  }

  onVibratoChange(value: boolean, op: Operators) {
    this.sysex.sendVibrato(value, op).catch(this.errorHandler.bind(this));
  }

  onTremoloChange(value: boolean, op: Operators) {
    this.sysex.sendTremolo(value, op).catch(this.errorHandler.bind(this));
  }

  onOutputLevelChange(value: number, op: Operators) {
    this.sysex.sendOutputLevel(value, op).catch(this.errorHandler.bind(this));
  }

  removeError(error: any) {
    this.errors = this.errors.filter(e => e !== error);
  }

  mapFrequenceMultiplier(val: number) {
    return val === 0 ? 0.5 : val;
  }

  private errorHandler(error: any) {
    this.errors = [error, ...this.errors];
  }

  private mapToObject<T>(map: Map<string, T>): { [key: string]: T } {
    return Array.from(map.entries())
      .reduce((main, [key, value]) => ({ ...main, [key]: value }), {});
  }
}
