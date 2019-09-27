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

  devicesControl = new FormControl();

  devices: {[key: string]: WebMidi.MIDIOutput} = {};
  devicesSub?: Subscription;
  controlSub?: Subscription;

  constructor(private readonly sysex: SysexService) {}

  ngOnInit(): void {
    this.sysex.initMIDI();

    this.devicesSub = this.sysex.getOutputDevices().subscribe(map => {
      this.devices = this.mapToObject(map);
    });

    this.controlSub = this.devicesControl.valueChanges.subscribe(key => {
      this.sysex.setOutputDevice(this.devices[key]);
    });
  }

  ngOnDestroy() {
    if (this.devicesSub) {
      this.devicesSub.unsubscribe();
    }

    if (this.controlSub) {
      this.controlSub.unsubscribe();
    }
  }

  get deviceAvailable() {
    return this.sysex.getDeviceAvailable();
  }

  onAttackRateChange(value: number, op: Operators) {
    this.sysex.sendAttackRate(value, op);
  }

  onDecayRateChange(value: number, op: Operators) {
    this.sysex.sendDecayRate(value, op);
  }

  onSustainLevelChange(value: number, op: Operators) {
    this.sysex.sendSustainLevel(value, op);
  }

  onReleaseRateChange(value: number, op: Operators) {
    this.sysex.sendReleaseRate(value, op);
  }

  onSustainingChange(value: number, op: Operators) {
    this.sysex.sendSustaining(value, op);
  }

  onEnvelopeScalingChange(value: number, op: Operators) {
    this.sysex.sendEnvelopeScaling(value, op);
  }

  onOutputLevelChange(value: number, op: Operators) {
    this.sysex.sendOutputLevel(value, op);
  }

  private mapToObject(map: WebMidi.MIDIOutputMap): {[key: string]: WebMidi.MIDIOutput} {
    return Array.from(map.entries())
        .reduce((main, [key, value]) => ({...main, [key]: value}), {} );
  }
}
