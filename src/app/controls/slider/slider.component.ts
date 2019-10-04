import { Component, OnInit, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { debounceTime, distinct, distinctUntilChanged } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-slider',
  templateUrl: './slider.component.html',
  styleUrls: ['./slider.component.scss']
})
export class SliderComponent implements OnInit, OnDestroy {

  @Input()
  min = 0;

  @Input()
  max = 100;

  @Input()
  default = 0;

  @Input()
  path = '';

  @Input()
  mapFn = (val: number) => val

  @Input()
  set enabled(value: boolean) {
    this._enabled = value;

    if (value) {
      this.valueControl.enable({ emitEvent: false });
    } else {
      this.valueControl.disable({ emitEvent: false });
    }
  }

  @Input()
  set instrument(instr: Instrument) {
    if (this.path) {
      const value = this.path.split('.').reduce((val: any, key) => val[key], instr);
      this.valueControl.setValue(value, { emitEvent: false });
    }
  }

  @Output()
  value = new EventEmitter<number>();

  valueControl = new FormControl();

  valueChangeSub?: Subscription;

  get enabled() {
    return this._enabled;
  }

  _enabled = false;

  constructor() { }

  ngOnInit() {
    this.valueControl.setValue(this.default);
    this.valueChangeSub = this.valueControl.valueChanges.pipe(
      debounceTime(200),
    ).subscribe(value => this.value.emit(value));
  }

  ngOnDestroy() {
    if (this.valueChangeSub) {
      this.valueChangeSub.unsubscribe();
    }
  }

  decrement() {
    this.valueControl.setValue(Math.max(this.valueControl.value - 1, this.min));
  }

  increment() {
    this.valueControl.setValue(Math.min(this.valueControl.value + 1, this.max));
  }

  get label() {
    return this.mapFn(+this.valueControl.value);
  }

}
