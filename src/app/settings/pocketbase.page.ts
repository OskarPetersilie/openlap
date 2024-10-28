import { Component, OnDestroy } from '@angular/core';

import { TranslateService } from '@ngx-translate/core';

import { take } from 'rxjs/operators';

import { AppSettings, Notification } from '../app-settings';
import { LoggingService, SpeechService } from '../services';

@Component({
  templateUrl: 'pocketbase.page.html'
})
export class PocketbasePage implements OnDestroy {

  pocketbase_auth_header: string;

  constructor(private logger: LoggingService, private settings: AppSettings, private speech: SpeechService, private translate: TranslateService) {
    
  }

  ngOnInit() {
    this.settings.getOpeworksPocketbaseConfig().pipe(take(1)).toPromise().then(e => {
      this.pocketbase_auth_header = e;
    }).catch(error => {
      this.logger.error('Error getting pocketbase', error);
    });
  }

  ngOnDestroy() {
    this.settings.setOpeworksPocketbaseConfig(this.pocketbase_auth_header).catch(error => {
      this.logger.error('Error setting pocketbase', error);
    });
  }
}
