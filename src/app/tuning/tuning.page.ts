import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';

import { PopoverController } from '@ionic/angular';

import { Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, take, switchMap } from 'rxjs/operators';

import { AppSettings, Driver, Options, PB_ENDPOINT, PB_AUTH_KEY } from '../app-settings';
import { AppService, I18nToastService, ControlUnitService, LoggingService } from '../services';

import PocketBase, { LocalAuthStore } from 'pocketbase';
import { TuningMenu } from './tuning.menu';

// TODO: store with CU or settings?
const MODELS = [0, 1, 2, 3, 4, 5].map(id => ({
  id: id,
  speed: null,
  brake: null,
  fuel: null
}));

@Component({
  templateUrl: 'tuning.page.html',
})
export class TuningPage implements OnDestroy, OnInit {

  private pb: PocketBase;
  connected: Observable<boolean>;

  drivers: Observable<Driver[]>;

  options: Observable<Options>;

  orientation: Observable<string>;

  models = MODELS;

  locked = false;

  type = 'speed';

  readonly placeholder = 'Driver {{number}}';

  readonly fromCU = {
    'speed': [0, 1, 2, 3, 5, 6, 7, 9, 11, 13, 15],
    'brake': [0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'fuel':  [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  };

  readonly toCU = {
    'speed': [1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
    'brake': [1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'fuel':  [1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10]
  }

  private subject = new Subject<{type: string, id: number}>();

  constructor(private logger: LoggingService, private cu: ControlUnitService, private popover: PopoverController,
    private ref: ChangeDetectorRef, app: AppService, private settings: AppSettings,
    private toast: I18nToastService
  ) {
    this.connected = cu.pipe(
      filter(cu => !!cu),
      switchMap(cu => cu.getState()),
      map(state => state == 'connected')
    );
    this.drivers = settings.getDrivers();
    this.options = settings.getOptions();
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

  ngOnInit() {
    this.subject.pipe(debounceTime(400)).subscribe((event) => {
      for (let model of (event.id !== undefined ? [this.models[event.id]] : this.models)) {
        switch (event.type) {
        case 'speed':
          this.cu.value.setSpeed(model.id, model.speed);
          break;
        case 'brake':
          this.cu.value.setBrake(model.id, model.brake);
          break;
        case 'fuel':
          this.cu.value.setFuel(model.id, model.fuel);
          break;
        }
      }
    });
  }

  ngOnDestroy() {
    this.subject.complete();
    this.drivers.pipe(
      take(1)
    ).subscribe(driversList => {
      this.settings.setDrivers(driversList).catch(error => {
        this.logger.error('Error setting drivers', error);
      });
    });
  }
  
  

  loadCarDefaults(model) {
    // Use pipe and take(1) for one-time subscription
    this.drivers.pipe(
      take(1)
    ).subscribe(driversList => {
      let driver = driversList[model.id];
      console.log(driver)
      if(driver && driver.car) {
        model.speed = driver.car.speed
        model.fuel = driver.car.fuel
        model.brake = driver.car.brake
      }
    });
    // send update commannds to CU
    this.update("speed", {detail: {value: model.speed}}, model.id);
    this.update("brake", {detail: {value: model.brake}}, model.id);
    this.update("fuel", {detail: {value: model.fuel}}, model.id);
  }

  saveCarDefaults(model) {
    // Use pipe and take(1) for one-time subscription
    this.drivers.pipe(
      take(1)
    ).subscribe(driversList => {
      let driver = driversList[model.id];
      if(driver && driver.car) {
        driver.car.brake = model.brake
        driver.car.fuel = model.fuel
        driver.car.speed = model.speed

        this.settings.setDrivers(driversList).catch(error => {
          this.logger.error('Error setting drivers', error);
        });
        this.pb.collection('cars').update(driver.car.id, {
          'brake': driver.car.brake,
          'fuel': driver.car.fuel,
          'speed': driver.car.speed
        }).then(() => {
          this.toast.showLongBottom(`Updated ${driver.car.name} Speed, Brake and Fuel defaults`).catch(error => {
            this.logger.error('Error showing toast', error);
          });
        }).catch(error => {
          this.logger.error('Error updating car', error);
          this.toast.showLongBottom(`ERROR updateing ${driver.car.name} Speed, Brake and Fuel defaults`).catch(error => {
            this.logger.error('Error showing toast', error);
          });
        })
      }
    });
  }

  applyAll() {
    for (let model of this.models) {
      if (model.speed !== null) {
        this.cu.value.setSpeed(model.id, model.speed);
      }
      if (model.brake !== null) {
        this.cu.value.setBrake(model.id, model.brake);
      }
      if (model.fuel !== null) {
        this.cu.value.setFuel(model.id, model.fuel);
      }
    }
  }

  showMenu(event) {
    return this.popover.create({
      component: TuningMenu, 
      componentProps: {
        apply: () => this.applyAll()
      },
      event: event
    }).then(menu => {
      menu.present();
    });
  }

  update(type: string, event: any, id?: number) {
    const value = event.detail.value;
    this.logger.debug('Set', type, 'to', value, 'for', id);
    for (let model of (id !== undefined ? [this.models[id]] : this.models)) {
      model[type] = value;
    }
    this.subject.next({id: id, type: type});
    this.ref.detectChanges();
  }

  updateCU(type: string, event: any, id?: number) {
    let value = event.detail.value;
    switch (type) {
    case 'speed':
      value = this.fromCU.speed[event.detail.value];
      break;
    case 'brake':
      value = this.fromCU.brake[event.detail.value];
      break;
    case 'fuel':
      value = this.fromCU.fuel[event.detail.value];
      break;
    }
    this.logger.debug('Set', type, 'to', value, 'for', id);
    for (let model of (id !== undefined ? [this.models[id]] : this.models)) {
      model[type] = value;
    }
    this.subject.next({id: id, type: type});
    this.ref.detectChanges();
  }
}
