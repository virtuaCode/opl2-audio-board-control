import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SliderComponent } from './slider/slider.component';
import { ReactiveFormsModule } from '@angular/forms';



@NgModule({
  declarations: [
    SliderComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
  ],
  exports: [
    SliderComponent
  ]
})
export class ControlsModule { }
