import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';

@Component({
  selector: 'app-patch',
  templateUrl: './patch.component.html',
  styleUrls: ['./patch.component.scss']
})
export class PatchComponent implements OnInit {
  constructor() { }

  @Input('current')
  set setCurrent(num: number) {
    this.bank = Math.floor(num / 8);
    this.patch = num % 8;
  }

  @Output()
  instrument = new EventEmitter<number>();

  bank = 2;
  patch = 3;

  ngOnInit(): void {
  }

  range(num: number): number[] {
    return [...new Array(num).keys()];
  }

  onSelectBank(i: number) {
    this.bank = i;
    this.instrument.emit(this.bank * 8 + this.patch);
  }

  onSelectPatch(i: number) {
    this.patch = i;
    this.instrument.emit(this.bank * 8 + this.patch);
  }
}
