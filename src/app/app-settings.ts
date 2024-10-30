import { Injectable, isDevMode } from '@angular/core';

import { SettingsService } from './services/settings.service';

import { Observable } from 'rxjs';

import { map } from 'rxjs/operators';

const DRIVERS = isDevMode() ? [
  {name: 'Max', code: 'MAX', color: '#3670c6'},
  {name: 'Fernando', code: 'FER', color: '#358c75'},
  {name: 'Lewis', code: 'LEW', color: '#6cd3bf'},
  {name: 'Charles', code: 'CHA', color: '#f91537'},
  {name: 'Lando', code: 'LAN', color: '#f58020'},
  {name: 'Nico', code: 'NIC', color: '#b6babd'},
  {name: 'Ghost', code: 'GHO', color: '#606060'},
  {name: 'Pace Car', code: 'PAC', color: '#d4af37'}
] : [
  {color: '#ff0000'},
  {color: '#00ff00'},
  {color: '#0000ff'},
  {color: '#ffff00'},
  {color: '#ff00ff'},
  {color: '#00ffff'},
  {color: '#ffffff'},
  {color: '#cccccc'}
];

const NOTIFICATIONS = {
  bestlap: true,
  bests1: false,
  bests2: false,
  bests3: false,
  falsestart: true,
  finallap: true,
  finished: true,
  finished1st: true,
  finished2nd: true,
  finished3rd: true,
  fivelaps: true,
  fuel0: true,
  fuel1: true,
  fuel2: true,
  greenflag: true,
  newleader: true,
  oneminute: true,
  pitenter: false,
  pitexit: false,
  timeout: true,
  yellowflag: true
};
export const PB_ENDPOINT = "https://vs3.oskar1504.dev/openlap_pocketbase";
// export const PB_ENDPOINT = "http://localhost:8102";
export const PB_AUTH_KEY = "carrera_pb_auth";

export class Connection {
  type?: string;
  name?: string;
  address?: string;
  connectionTimeout = 3000;
  requestTimeout = 2000;
  minReconnectDelay = 3000;
  maxReconnectDelay = 8000;
  demoControlUnit = isDevMode();
}

export class Options {
  cumode = true;
  debug = isDevMode();
  fixedorder = false;
  language = '';
  speech = true;
  sectors = false;
  voice = '';
  rate = 1000;
  pitch = 1000;
}

export interface Notification {
  enabled: boolean;
  message?: string;
}

export interface Driver {
  name?: string;
  code?: string;
  color: string;
  car?: Car;
}

export interface Car {
  id: string;
  name?: string;
  code?: string;
  color?: string;
  speed?: number;
  brake?: number;
  fuel?: number;
}

export class RaceOptions {
  constructor(public mode: 'practice' | 'qualifying' | 'race') {
    switch (mode) {
    case 'practice':
      this.laps = 0;
      this.time = 0;
      this.auto = true;
      this.pace = true;
      break;
    case 'qualifying':
      this.laps = 0;
      this.time = 3 * 60 * 1000;
      break;
    case 'race':
      this.laps = 30;
      this.time = 0;
      break;
    }
  }
  laps: number;
  time: number;
  pause = false;
  slotmode = false;
  stopfin = false;
  drivers?: number;
  auto = false;
  pace = false;
  minLapTime = 500;  // FIXME: Configurable?
}

@Injectable({
  providedIn: 'root'
})
export class AppSettings {

  constructor(private settings: SettingsService) {}

  clear() {
    return this.settings.clear();
  }

  getConnection() {
    return this.settings.observe('connection').pipe(
      map(value => Object.assign(new Connection(), value))
    );
  }

  setConnection(value: Connection) {
    return this.settings.set('connection', value);
  }

  getDrivers() {
    return this.settings.observe('drivers').pipe(
      map(value => {
        const result = new Array<Driver>(8);
        for (let i = 0; i != result.length; ++i) {
          result[i] = Object.assign(DRIVERS[i], value ? value[i] : null);
        }
        return result;
      })
    );
  }

  setDrivers(value: Array<Driver>) {
    return this.settings.set('drivers', value);
  }

  getNotifications() {
    return this.settings.observe('notifications').pipe(
      map(value => {
        const result = {};
        for (let key of Object.keys(NOTIFICATIONS)) {
          result[key] = Object.assign({enabled: NOTIFICATIONS[key]}, value ? value[key] : null);
        }
        return result;
      })
    );
  }

  setNotifications(value: {[key: string]: Notification}) {
    return this.settings.set('notifications', value);
  }

  setOpeworksPocketbaseConfig(value: string) {
    return this.settings.set('pocketbase_auth_header', value);
  }

  getOpeworksPocketbaseConfig(): Observable<string> {
    return this.settings.observe('pocketbase_auth_header')
  }

  getOptions() {
    return this.settings.observe('options').pipe(
      map(value => Object.assign(new Options(), value))
    );
  }

  setOptions(value: Options) {
    return this.settings.set('options', value);
  }

  getQualifyingSettings(): Observable<RaceOptions> {
    return this.settings.observe('qualifying').pipe(
      map(value => Object.assign(new RaceOptions('qualifying'), value))
    );
  }

  setQualifyingSettings(value: any) {
    return this.settings.set('qualifying', value);
  }

  getRaceSettings(): Observable<RaceOptions> {
    return this.settings.observe('race').pipe(
      map(value => Object.assign(new RaceOptions('race'), value))
    );
  }

  setRaceSettings(value: any) {
    return this.settings.set('race', value);
  }
}
