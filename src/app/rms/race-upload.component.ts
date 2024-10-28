import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController, NavParams } from '@ionic/angular';
import PocketBase, { LocalAuthStore } from 'pocketbase';
import { PB_ENDPOINT, PB_AUTH_KEY,  AppSettings } from '../app-settings';
import { LoggingService  } from '../services';
import {  switchMap, take, map } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { of, combineLatest } from 'rxjs';

interface Tracks {
  id: string;
  name: string;
  description?: string;
}

@Component({
  templateUrl: 'race-upload.component.html'
})
export class RaceUploadComponent implements OnInit {
  form: FormGroup;
  tracks: Tracks[] = [];
  loading = true;
  error: string | null = null;
  session: any; // Add this to store the session data
  
  private pb: PocketBase;

  constructor(
    private fb: FormBuilder,
    private modalCtrl: ModalController,
    private navParams: NavParams,
    private logger: LoggingService,
    private translate: TranslateService,
    private settings: AppSettings
  ) {
    this.pb = new PocketBase(PB_ENDPOINT, new LocalAuthStore(PB_AUTH_KEY));
    this.settings.getOpeworksPocketbaseConfig().pipe(take(1)).toPromise().then(e => {
      this.pb.beforeSend = function (url, options) {
        options.headers = Object.assign({}, options.headers, { 'x-token': e});
        return { url, options };
      };
    }).catch(error => {
      this.logger.error('Error getting pocketbase', error);
    });

    // Get the session from navParams
    this.session = this.navParams.get('session');

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      track: ['', Validators.required]
    });
  }

  async ngOnInit() {
    try {
      this.loading = true;
      const records = await this.pb.collection('tracks').getFullList({
        sort: 'name',
      });
      
      this.tracks = records.map(record => ({
        id: record.id,
        name: record['name'],
        description: record['description']
      }));
    } catch (err) {
      console.error('Error loading street layouts:', err);
      this.error = 'Failed to load street layouts';
    } finally {
      this.loading = false;
    }
  }

  getRanking() {
    let ranking = [];
    if (this.session && this.session.ranking) {
      this.session.ranking.forEach(rankingList => {
        ranking = rankingList;
      });
    }
    return ranking;
  }

  async onSubmit(formValue: any) {
    try {
      this.loading = true;

      let ranking = this.getRanking()

      // Simpler version
      const drivers = this.settings.getDrivers()

      // Subscribe to use it
      drivers.subscribe(driversList => {
        ranking = ranking.map(rankingDriver => {
          const driver = driversList.find((d, i) => i === rankingDriver.id)
          if(driver) {
            rankingDriver.name = driver.name
            rankingDriver.driverColor = driver.color
          }
          return rankingDriver
        })
      });
      
      const raceData = {
        ...formValue,
        raceData: ranking
      };

      const record = await this.pb.collection('races').create(raceData);
      
      this.modalCtrl.dismiss({
        success: true,
        record: record
      });
      
    } catch (err) {
      console.error('Error creating race:', err);
      this.error = 'Failed to create race';
      this.loading = false;
    }
  }

  onCancel() {
    this.modalCtrl.dismiss({
      success: false
    });
  }

  // see https://github.com/ngx-translate/core/issues/330
  private getTranslations(key: string, params?: Object) {
    return this.translate.stream(key, params);
  }
}