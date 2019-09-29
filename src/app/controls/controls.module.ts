import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SliderComponent } from './slider/slider.component';
import { ReactiveFormsModule } from '@angular/forms';
import { CheckboxComponent } from './checkbox/checkbox.component';



@NgModule({
  declarations: [
    SliderComponent,
    CheckboxComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
  ],
  exports: [
    SliderComponent,
    CheckboxComponent
  ]
})
export class ControlsModule { }
