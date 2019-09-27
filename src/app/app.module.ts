import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FlexLayoutModule } from '@angular/flex-layout';
import { AppComponent } from './app.component';
import { ControlsModule } from './controls/controls.module';

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    FlexLayoutModule,
    ReactiveFormsModule,
    BrowserModule,
    ControlsModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
