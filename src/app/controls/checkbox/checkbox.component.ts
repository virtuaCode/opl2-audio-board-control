import { Component, OnInit, Input, Output, EventEmitter, OnDestroy, ChangeDetectorRef, SimpleChanges, OnChanges } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrls: ['./checkbox.component.scss']
})
export class CheckboxComponent implements OnInit, OnDestroy {

  @Input()
  invert = false;

  @Input()
  default = false;

  @Input()
  set enabled(value: boolean) {
    this._enabled = value;

    if (value) {
      this.valueControl.enable({ emitEvent: false });
    } else {
      this.valueControl.disable({ emitEvent: false });
    }
  }

  get enabled() {
    return this._enabled;
  }

  _enabled = false;

  @Input()
  set instrument(instr: Instrument) {
    if (this.path) {
      const value = this.path.split('.').reduce((val: any, key) => val[key], instr);
      this.valueControl.setValue(value, { emitEvent: false});
    }
  }

  @Input()
  path = '';

  @Output()
  value = new EventEmitter<boolean>();

  valueControl = new FormControl();

  valueChangeSub?: Subscription;

  constructor() { }

  ngOnInit() {
    this.valueControl.setValue(this.default);
    this.valueChangeSub = this.valueControl.valueChanges.pipe(
      debounceTime(200),
    ).subscribe(value => this.value.emit(this.invert ? !value : value));
  }

  ngOnDestroy() {
    if (this.valueChangeSub) {
      this.valueChangeSub.unsubscribe();
    }
  }

}
