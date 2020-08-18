import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SliderComponent } from './slider/slider.component';
import { ReactiveFormsModule } from '@angular/forms';
import { CheckboxComponent } from './checkbox/checkbox.component';
import { PatchComponent } from './patch/patch.component';



@NgModule({
  declarations: [
    SliderComponent,
    CheckboxComponent,
    PatchComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
  ],
  exports: [
    SliderComponent,
    CheckboxComponent,
    PatchComponent
  ]
})
export class ControlsModule { }
