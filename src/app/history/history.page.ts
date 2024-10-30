// cars.page.ts
import { Component, OnInit, ViewChild } from '@angular/core';
import { AppService } from '../services/app.service';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { take } from 'rxjs/operators';
import { LoggingService } from '../services';

import { AppSettings, Driver, Car, PB_ENDPOINT, PB_AUTH_KEY } from '../app-settings';
import PocketBase, { LocalAuthStore } from 'pocketbase';

interface Race {
  id: string;
  name?: string;
  raceData: Array<any>;
  track: string;
}

@Component({
  selector: 'app-race-grid',
  templateUrl: 'history.page.html',
  styleUrls: ['./history.page.scss']
})
export class HistoryPage implements OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  version: Promise<string>;
  selectedDocument: Race | null = null;
  documents: Race[] = [];

  private pb: PocketBase;

  public lineChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Document Data',
        fill: false,
        borderColor: 'rgb(0, 115,0)',
        tension: 0.1
      }
    ]
  };

  public lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      title: {
        color: 'white',
        display: true,
        text: 'Zeit pro Runde'
      }
    }
  };

  constructor(private app: AppService, private settings: AppSettings, private logger: LoggingService) {
    this.version = app.getVersion();
    
    this.pb = new PocketBase(PB_ENDPOINT, new LocalAuthStore(PB_AUTH_KEY));
    this.settings.getOpeworksPocketbaseConfig().pipe(take(1)).toPromise().then(e => {
      this.pb.beforeSend = function (url, options) {
        options.headers = Object.assign({}, options.headers, { 'x-token': e});
        return { url, options };
      };
    }).catch(error => {
      this.logger.error('Error getting pocketbase', error);
    });
  }

  async ngOnInit() {
    this.documents = await this.pb.collection('races').getFullList({ sort: '-created' });
  }

  onDocumentSelect(event: any) {
    const doc = this.documents.find(d => d.id === event.detail.value);
    if (doc) {
      this.selectedDocument = doc;
      this.updateChart(doc);
    }
  }

  getLapTimes(cumulativeTimes) {
    // Check if the input array has at least two elements
    if (cumulativeTimes.length < 2) return [];
    let lapTimes = [];

    // Calculate each lap time by subtracting the previous timestamp
    for (let i = 1; i < cumulativeTimes.length; i++) {
        lapTimes.push(cumulativeTimes[i] - cumulativeTimes[i - 1]);
    }
    return lapTimes;
  }

  sumSectors(times, sector) {
    // Initialize an array to hold the sector sums
    let sectorSums = [];

    // Loop through the times array in steps of 'sector'
    for (let i = 0; i < times.length; i += sector) {
        // Sum up the values in each sector
        let sectorSum = times.slice(i, i + sector).reduce((acc, time) => acc + time, 0);
        sectorSums.push(sectorSum);
    }

    // Return the array of sector sums
    return sectorSums;
  }

  formatTime(ms: number): string {
    if (!ms) return '-';
    
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  private updateChart(document: Race) {
    const labels = [...new Array(document.raceData[0].laps)].map((e, i) => `Runde ${i}`)
    this.lineChartData.labels = labels;
    this.lineChartData.datasets = []

    this.lineChartData.datasets = document.raceData.map((driverRaceData, i) => {
      const sectorTimes = this.getLapTimes(driverRaceData.times.flat());
      const sectorSums = this.sumSectors(sectorTimes, driverRaceData.sector);
      return {
        data: sectorSums,
        label: driverRaceData.name,
        fill: false,
        borderColor: driverRaceData.driverColor || `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)})`,
        backgroundColor: driverRaceData.driverColor || `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)})`,
        tension: 0.1
      }
    })

    console.log(this.chart)
    console.log(this.lineChartData)

    this.chart?.update();
  }
}
