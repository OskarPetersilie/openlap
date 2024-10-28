// cars.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../shared';
import { HistoryPage } from './history.page';
import { NgChartsModule } from 'ng2-charts'; // Add Chart.js support

@NgModule({
  declarations: [
    HistoryPage
  ],
  exports: [
    HistoryPage
  ],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    NgChartsModule
  ]
})
export class HistoryModule {}