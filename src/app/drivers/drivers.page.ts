import { Component, OnDestroy, OnInit } from '@angular/core';

import { ModalController } from '@ionic/angular';

import { take } from 'rxjs/operators';

import { TranslateService } from '@ngx-translate/core';

import { Observable } from 'rxjs';

import { AppSettings, Driver, Car, PB_ENDPOINT, PB_AUTH_KEY } from '../app-settings';
import { AppService, ControlUnitService, LoggingService, SpeechService } from '../services';

import { ColorComponent } from './color.component';

import { ControlUnitButton } from '../carrera';
import PocketBase, { LocalAuthStore } from 'pocketbase';

@Component({
  templateUrl: 'drivers.page.html'
})
export class DriversPage implements OnDestroy, OnInit {

  private pb: PocketBase;
  drivers: Driver[];

  cars: Car[] = [];
  loading = true;
  error: string | null = null;

  orientation: Observable<string>;

  readonly placeholder = 'Driver {{number}}';

  constructor(
    private app: AppService,
    private cu: ControlUnitService, 
    private logger: LoggingService,
    private settings: AppSettings,
    private mc: ModalController,
    private speech: SpeechService,
    private translate: TranslateService) 
  {
    this.orientation = app.orientation;

    
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
    this.settings.getDrivers().pipe(take(1)).toPromise().then(drivers => {
      this.drivers = drivers;
    }).catch(error => {
      this.logger.error('Error getting drivers', error);
    });

    try {
      this.loading = true;
      const records = await this.pb.collection('cars').getFullList({
        sort: 'name',
      });
      
      this.cars = records.map(record => ({
        id: record.id,
        name: record['name'],
        code: record['code'],
        speed: record['speed'],
        fuel: record['fuel'],
        brake: record['brake'],
        color: record['color']
      }));
    } catch (err) {
      console.error('Error loading cars:', err);
      this.error = 'Failed to load cars';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.settings.setDrivers(this.drivers).catch(error => {
      this.logger.error('Error setting drivers', error);
    });
  }

  onCarSelect(event: any, driver: Driver) {
    // The selected value is in event.detail.value
    const selectedCarId = event.detail.value;
    const car = this.cars.find(car => car.id === selectedCarId);
    if (car) {
      driver.car = car;
      driver.name = `${driver.name.split("#")[0]}#${car.code}`;
    }else {
      driver.car = undefined;  // Clear the car if none selected
      driver.name = `${driver.name.split("#")[0]}`;
    }
  }

  // Add this method to get the selected car's ID for the ion-select
  getSelectedCarId(driver: Driver): string | undefined {
    return driver.car?.id;
  }

  getCode(name: string, id: number) {
    let chars = name.replace(/\W/g, '').toUpperCase();  // TODO: proper Unicode support
    let codes = this.drivers.filter((_, index) => index !== id).map(obj => obj.code);
    for (let n = 2; n < chars.length; ++n) {
      let s = chars.substr(0, 2) + chars.substr(n, 1);
      if (codes.indexOf(s) === -1) {
        return s;
      }
    }
    return undefined;
  }

  reorderItems(event: any) {
    // TODO: optionally stick color to controller ID
    //let colors = this.drivers.map(driver => driver.color);
    let element = this.drivers[event.detail.from];
    this.drivers.splice(event.detail.from, 1);
    this.drivers.splice(event.detail.to, 0, element);
    /*
    colors.forEach((color, index) => {
      this.drivers[index].color = color;
    });
    */
    event.detail.complete();
  }

  chooseColor(id: number) {
    return this.mc.create({
      component: ColorComponent, 
      componentProps: {id: id, driver: this.drivers[id]}
    }).then(modal => {
      modal.onDidDismiss().then(detail => {
        if (detail.data) {
          this.drivers[id].color = detail.data;
        }
      });
      modal.present();
    });
  }

  speak(id: number) {
    this.getDriverName(id).then(name => {
      this.speech.speak(name);
    })
  }

  pressCodeButton() {
    this.cu.value.trigger(ControlUnitButton.CODE);
  }

  onChangeName(event) {
    event?.target?.getInputElement().then(e => e.blur());
  }

  private getDriverName(id) {
    if (this.drivers[id] && this.drivers[id].name) {
      return Promise.resolve(this.drivers[id].name);
    } else {
      return this.translate.get(this.placeholder, {number: id + 1}).toPromise();
    }
  }
}
