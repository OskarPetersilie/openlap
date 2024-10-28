import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PopoverController, Platform, ModalController } from '@ionic/angular';

import { TranslateService } from '@ngx-translate/core';

import { Observable, Subscription, from, of, merge } from 'rxjs';
import { combineLatest } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, pairwise, share, skipWhile, startWith, switchMap, take, withLatestFrom } from 'rxjs/operators';

import { AppSettings, Options, RaceOptions } from '../app-settings';
import { ControlUnit } from '../carrera';
import { AppService, ControlUnitService, LoggingService, SpeechService } from '../services';

import { LeaderboardItem } from './leaderboard';
import { RmsMenu } from './rms.menu';
import { Session } from './session';
import { RaceUploadComponent } from './race-upload.component';

const compare = {
  'position': (lhs: LeaderboardItem, rhs: LeaderboardItem) => {
    return lhs.position - rhs.position;
  },
  'number':  (lhs: LeaderboardItem, rhs: LeaderboardItem) => {
    return lhs.id - rhs.id;
  }
};

@Component({
  templateUrl: 'rms.page.html',
})
export class RmsPage implements OnDestroy, OnInit {

  mode: 'practice' | 'qualifying' | 'race';

  session: Session;

  options: Options;
  
  pitlane: Observable<boolean>;
  sectors: Observable<boolean>;
  items: Observable<LeaderboardItem[]>;

  lapcount: Observable<{count: number, total: number}>;

  start: Observable<number>;

  orientation: Observable<string>;

  legacyAndroid: Promise<boolean>;

  private subscriptions: Subscription;

  private backButtonSubscription: Subscription;

  private dataSubscription: Subscription;

  private subscription = new Subscription();

  constructor(public cu: ControlUnitService, private app: AppService,
    private mod: ModalController,
    private logger: LoggingService, private settings: AppSettings, private speech: SpeechService,
    private popover: PopoverController, private translate: TranslateService, route: ActivatedRoute)
  {
    const mode = route.snapshot.paramMap.get('mode');
    switch (mode) {
    case 'practice':
    case 'qualifying':
    case 'race':
      this.mode = mode;
      break;
    default:
      this.mode = 'practice';
    }
        
    const cuMode = cu.pipe(
      filter(cu => !!cu),
      mergeMap(cu => cu.getMode()), 
      startWith(0),
      distinctUntilChanged()
    );

    // TODO: pitlane flag is actually (cuMode & 0x04), rename to fuelMode?
    this.pitlane = cuMode.pipe(
      map(value => (value & 0x03) != 0)
    );

    this.sectors = settings.getOptions().pipe(
      map(options => options.sectors)
    );

    this.start = cu.pipe(
      filter(cu => !!cu),
      mergeMap(cu => cu.getStart()),
      distinctUntilChanged()
    );

    this.orientation = app.orientation;  // for showing/hiding additional icons

    // flag for older Android versions that require Location services and support USB OTG connections
    this.legacyAndroid = app.isAndroid() && app.isCordova() ?
      app.getDeviceInfo().then(device => (device.version < '12')) :
      Promise.resolve(false);
    }

  ngOnInit() {
    this.subscription.add(combineLatest([this.cu, this.getRaceOptions(this.mode)]).subscribe(([cu, options]) => {
      if (cu && options) {
        this.session = this.startSession(cu, options);
      } else {
        this.session = null;
      }
    }));
    this.subscription.add(this.settings.getOptions().subscribe(options => {
      this.options = options;
    }));
  }

  startSession(cu: ControlUnit, options: RaceOptions) {
    const session = new Session(cu, options);

    this.lapcount = session.currentLap.pipe(
      map(lap => {
        return {
          count: lap,
          total: options.laps
        };
      }),
      startWith({
          count: 0,
          total: options.laps
      })
    );

    const drivers = this.settings.getDrivers().pipe(switchMap(drivers => {
      const observables = drivers.map((obj, index) => {
        const code = obj.code || '#' + (index + 1);
        if (obj.name) {
          return of({name: obj.name, code: code, color: obj.color});
        } else {
          return this.getTranslations('Driver {{number}}', {number: index + 1}).pipe(map((name: string) => {
            return {name: name, code: code, color: obj.color}
          }));
        }
      });
      return combineLatest(observables);
    }));

    const best = [Infinity, Infinity, Infinity, Infinity];
    const events = merge(
      session.grid.pipe(
        map(obs => obs.pipe(pairwise())),
        mergeMap(obs => obs),
        mergeMap(([prev, curr]) => {
          const events = [];
          curr.best.forEach((time, index) => {
            if ((time || Infinity) < best[index]) {
              best[index] = time;
              if (curr.laps >= 3) {
                events.push([index ? 'bests' + index : 'bestlap', curr.id]);
              }
            }
          });
          if (!curr.finished && curr.time) {
            if (curr.fuel < prev.fuel) {
              events.push(['fuel' + curr.fuel, curr.id]);
            }
            if (curr.pit && !prev.pit) {
              events.push(['pitenter', curr.id]);
            }
            if (!curr.pit && prev.pit) {
              events.push(['pitexit', curr.id]);
            }
          }
          return from(events);
        }),
      ),
      session.ranking.pipe(
        filter(items => items.length > 0 && options.mode == 'race'),
        map(items => items.map(e => {return {id: e.id, finished: e.finished}})),
        pairwise(),
        filter(([_, curr]) => curr[0].finished),
        mergeMap(([prev, curr]) => {
          const events = [];
          if (!prev[0].finished && curr[0].finished) {
            if (curr.length > 1) {
              events.push(['finished1st', curr[0].id]);
            } else {
              events.push(['finished', null]);
            }
          }
          if (curr.length >= 2 && !prev[1]?.finished && curr[1].finished) {
            events.push(['finished2nd', curr[1].id]);
          }
          if (curr.length >= 3 && !prev[2]?.finished && curr[2].finished) {
            events.push(['finished3rd', curr[2].id]);
          }
          return from(events);
        }),
      ),
      session.ranking.pipe(
        filter(items => items.length != 0 && options.mode == 'race'),
        map(items => items[0]),
        pairwise(),
        filter(([prev, curr]) => prev.id != curr.id),
        map(([_, curr]) => ['newleader', curr.id])
      ),
      session.timer.pipe(
        filter(time => {
          return options.time >= 120_000 && time <= 60_000 && !session.finished.value;
        }),
        take(1),
        map(() => ['oneminute', null])
      ),
      session.timer.pipe(
        map(time => [time, session.finished.value]),
        pairwise(),
        map(([prev, curr]) => [curr[0], prev[1]]),
        filter(([time, fin]) => {
          return time == 0 && !fin;
        }),
        take(1),
        map(() => ['timeout', null])
      ),
      session.yellowFlag.pipe(
        distinctUntilChanged(),
        skipWhile(value => !value),
        map(value => [value ? 'yellowflag' : 'greenflag', null])
      ),
      session.allFinished.pipe(
        filter(v => v),
        take(1),
        map(() => ['alldone', null])  // TODO: add notification, qualifying vs. race?
      ),
      this.lapcount.pipe(
        filter(laps => {
          return options.laps >= 10 && laps.count === options.laps - 4 && !session.finished.value;
        }),
        take(1),
        map(() => ['fivelaps', null])  // TODO: threelaps, too?
      ),
      this.lapcount.pipe(
        filter(laps => {
          return options.laps && laps.count === options.laps && !session.finished.value;
        }),
        take(1),
        map(() => ['finallap', null])
      ),
      this.start.pipe(
        distinctUntilChanged(),
        filter(value => value === 9),
        map(() => ['falsestart', null])
      )
    ).pipe(
      withLatestFrom(drivers),
      map(([[event, id], drivers]) => {
        return <[string, any]>[event, id !== null ? drivers[id] : null];
      })
    );

    const order = this.settings.getOptions().pipe(
      map(options => options.fixedorder ? 'number' : 'position')
    );
    const gridpos = [];
    const pitfuel = [];
    this.items = combineLatest([session.ranking, drivers, order]).pipe(
      map(([ranks, drivers, order]) => {
        const items = ranks.map((item, index) => {
          if (options.mode == 'race' && gridpos[item.id] === undefined && item.time !== undefined) {
            gridpos[item.id] = index;
          }
          if (!item.pit || item.fuel < pitfuel[item.id]) {
            pitfuel[item.id] = item.fuel;
          }
          return Object.assign({}, item, {
            position: index,
            driver: drivers[item.id],
            gridpos: gridpos[item.id],
            refuel: item.pit && item.fuel > pitfuel[item.id]
          });
        });
        items.sort(compare[order || 'position']);
        return items;
      }),
      share()
    );

    if (this.subscriptions) {
      this.subscriptions.unsubscribe();
    }
    this.subscriptions = events.pipe(withLatestFrom(
      this.settings.getOptions(),
      this.settings.getNotifications(),
      this.getTranslations('notifications')
    )).subscribe(([[event, driver], options, notifications, translations]) => {
      this.logger.debug('Race event: ' + event, driver);
      if (options.speech && notifications[event] && notifications[event].enabled) {
        let message = notifications[event].message || translations[event];
        if (driver && driver.name) {
          this.speech.speak(driver.name + ': ' + message);
        } else {
          this.speech.speak(message);
        }
      }
    });

    this.subscriptions.add(
      this.lapcount.subscribe(
        laps => {
          cu.setLap(laps.count);
        },
        error => {
          this.logger.error('Lap counter error:', error);
        },
        () => {
          this.logger.info('Lap counter finished');
        }
      )
    );

    this.subscriptions.add(
      events.pipe(
        filter(([event]) => event == 'alldone'),
        withLatestFrom(this.getRaceOptions(options.mode))
      ).subscribe(([[event], options]) => {
        if (options.stopfin) {
          cu.toggleStart();  // TODO: read state?
        }
      })
    );

    if (options.mode != 'practice') {
      const start = cu.getStart();
      start.pipe(take(1)).toPromise().then(value => {
        if (value === 0) {
          cu.toggleStart();
        }
        // wait until startlight goes off; TODO: subscribe/unsubscribe?
        cu.getStart().pipe(pairwise(),filter(([prev, curr]) => {
          return prev != 0 && curr == 0;
        }),take(1),).toPromise().then(() => {
          this.logger.info('Start ' + options.mode + ' mode');
          session.start();
        });
      });

    }

    return session;
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    if (this.subscriptions) {
      this.subscriptions.unsubscribe();
    }
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }
  }

  ionViewDidEnter(){
    this.backButtonSubscription = this.app.backButton.subscribe(() => {
      // TODO: confirm or press back button twice?
      if (this.cu.value) {
        this.cu.value.disconnect().catch(error => {
          this.logger.error('Error disconnecting from CU:', error);
        }).then(() => {
          this.app.exit();
        });
      } else {
        this.app.exit();
      }
    });
  }

  ionViewWillLeave(){
    this.backButtonSubscription.unsubscribe();
  }

  restartSession() {
    if (this.session) {
      this.session = this.startSession(this.session.cu, this.session.options);
    }
  }

  cancelSession() {
    if (this.session) {
      this.session.stop();
    }
  }

  private getRaceOptions(mode: string) {
    switch (mode) {
      case 'race':
        return this.settings.getRaceSettings();
      case 'qualifying':
        return this.settings.getQualifyingSettings();
      default:
        return of(new RaceOptions('practice'));
    }
  }

  toggleSpeech() {
    if (this.options) {
      this.settings.setOptions(Object.assign({}, this.options, {speech: !this.options.speech}));
    }
  }

  uploadRaceDataV2() {
    this.mod.create({
      component: RaceUploadComponent,
      componentProps: {
        session: this.session
      }
    }).then(modal => {
      modal.onDidDismiss().then(detail => {
        console.log(detail)
      });
      modal.present();
    });
  }

  toggleYellowFlag() {
    if (this.session) {
      this.session.toggleYellowFlag();
    }
  }

  showMenu(event: Event) {
    return this.popover.create({
      component: RmsMenu,
      componentProps: {
        mode: this.mode,
        active: this.session && !this.session.finished.value && this.mode != 'practice',
        restart: () => this.restartSession(),
        cancel:  () => this.cancelSession()
      }, 
      event: event
    }).then(menu => {
      menu.present();
    });
  }

  // see https://github.com/ngx-translate/core/issues/330
  private getTranslations(key: string, params?: Object) {
    return this.translate.stream(key, params);
  }
}
