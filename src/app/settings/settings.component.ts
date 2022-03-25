import { Component, OnInit, EventEmitter } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { isoLangs } from './locales_list';
import { MatSnackBar } from '@angular/material/snack-bar';
import {DomSanitizer} from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ArgModifierDialogComponent } from 'app/dialogs/arg-modifier-dialog/arg-modifier-dialog.component';
import { CURRENT_VERSION } from 'app/consts';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { CookiesUploaderDialogComponent } from 'app/dialogs/cookies-uploader-dialog/cookies-uploader-dialog.component';
import { ConfirmDialogComponent } from 'app/dialogs/confirm-dialog/confirm-dialog.component';
import { moveItemInArray, CdkDragDrop } from '@angular/cdk/drag-drop';
import { InputDialogComponent } from 'app/input-dialog/input-dialog.component';
import { EditCategoryDialogComponent } from 'app/dialogs/edit-category-dialog/edit-category-dialog.component';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  all_locales = isoLangs;
  supported_locales = ['en', 'es', 'de', 'fr', 'nl', 'pt', 'it', 'ca', 'cs', 'nb', 'ru', 'zh', 'ko', 'id', 'en-GB'];
  initialLocale = localStorage.getItem('locale');

  initial_config = null;
  new_config = null
  loading_config = false;
  generated_bookmarklet_code = null;
  bookmarkletAudioOnly = false;

  db_info = null;
  db_transferring = false;
  testing_connection_string = false;

  _settingsSame = true;

  latestGithubRelease = null;
  CURRENT_VERSION = CURRENT_VERSION

  tabs = ['main', 'downloader', 'extra', 'database', 'advanced', 'users', 'logs'];
  tabIndex = 0;
  
  INDEX_TO_TAB = Object.assign({}, this.tabs);
  TAB_TO_INDEX = {};
  
  usersTabDisabledTooltip = $localize`You must enable multi-user mode to access this tab.`;

  get settingsAreTheSame(): boolean {
    this._settingsSame = this.settingsSame()
    return this._settingsSame;
  }

  set settingsAreTheSame(val: boolean) {
    this._settingsSame = val;
  }

  constructor(public postsService: PostsService, private snackBar: MatSnackBar, private sanitizer: DomSanitizer,
    private dialog: MatDialog, private router: Router, private route: ActivatedRoute) {
      // invert index to tab
      Object.keys(this.INDEX_TO_TAB).forEach(key => { this.TAB_TO_INDEX[this.INDEX_TO_TAB[key]] = key; });
    }

  ngOnInit() {
    if (this.postsService.initialized) {
      this.getConfig();
      this.getDBInfo();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getConfig();
          this.getDBInfo();
        }
      });
    }

    this.generated_bookmarklet_code = this.sanitizer.bypassSecurityTrustUrl(this.generateBookmarkletCode());

    this.getLatestGithubRelease();

    const tab = this.route.snapshot.paramMap.get('tab');
    this.tabIndex = tab && this.TAB_TO_INDEX[tab] ? this.TAB_TO_INDEX[tab] : 0;

    this.postsService.getSupportedLocales().subscribe(res => {
      if (res && res['supported_locales']) {
        this.supported_locales = ['en', 'en-GB']; // required
        this.supported_locales = this.supported_locales.concat(res['supported_locales']);
      }
    });
  }

  getConfig() {
    this.initial_config = this.postsService.config;
    this.new_config = JSON.parse(JSON.stringify(this.initial_config));
  }

  settingsSame() {
    return JSON.stringify(this.new_config) === JSON.stringify(this.initial_config);
  }

  saveSettings() {
    const settingsToSave = {'YoutubeDLMaterial': this.new_config};
    this.postsService.setConfig(settingsToSave).subscribe(res => {
      if (res['success']) {
        if (!this.initial_config['Advanced']['multi_user_mode'] && this.new_config['Advanced']['multi_user_mode']) {
          // multi user mode was enabled, let's check if default admin account exists
          this.postsService.checkAdminCreationStatus(true);
        }
        // sets new config as old config
        this.initial_config = JSON.parse(JSON.stringify(this.new_config));
        this.postsService.reload_config.next(true);
      }
    }, err => {
      console.error('Failed to save config!');
    })
  }

  cancelSettings() {
    this.new_config = JSON.parse(JSON.stringify(this.initial_config));
  }

  tabChanged(event) {
    const index = event['index'];
    this.router.navigate(['/settings', {tab: this.INDEX_TO_TAB[index]}]);
  }

  dropCategory(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.postsService.categories, event.previousIndex, event.currentIndex);
    this.postsService.updateCategories(this.postsService.categories).subscribe(res => {

    }, err => {
      this.postsService.openSnackBar('Failed to update categories!');
    });
  }

  openAddCategoryDialog() {
    const done = new EventEmitter<any>();
    const dialogRef = this.dialog.open(InputDialogComponent, {
      width: '300px',
      data: {
        inputTitle: 'Name the category',
        inputPlaceholder: 'Name',
        submitText: 'Add',
        doneEmitter: done
      }
    });

    done.subscribe(name => {

      // Eventually do additional checks on name
      if (name) {
        this.postsService.createCategory(name).subscribe(res => {
          if (res['success']) {
            this.postsService.reloadCategories();
            dialogRef.close();
            const new_category = res['new_category'];
            this.openEditCategoryDialog(new_category);
          }
        });
      }
    });
  }

  deleteCategory(category) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: 'Delete category',
        dialogText: `Would you like to delete ${category['name']}?`,
        submitText: 'Delete',
        warnSubmitColor: true
      }
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.postsService.deleteCategory(category['uid']).subscribe(res => {
          if (res['success']) {
            this.postsService.openSnackBar(`Successfully deleted ${category['name']}!`);
            this.postsService.reloadCategories();
          }
        }, err => {
          this.postsService.openSnackBar(`Failed to delete ${category['name']}!`);
        });
      }
    });
  }

  openEditCategoryDialog(category) {
    this.dialog.open(EditCategoryDialogComponent, {
      data: {
        category: category
      }
    });
  }

  generateAPIKey() {
    this.postsService.generateNewAPIKey().subscribe(res => {
      if (res['new_api_key']) {
        this.initial_config.API.API_key = res['new_api_key'];
        this.new_config.API.API_key = res['new_api_key'];
      }
    });
  }

  localeSelectChanged(new_val) {
    localStorage.setItem('locale', new_val);
    this.openSnackBar('Language successfully changed! Reload to update the page.')
  }

  generateBookmarklet() {
    this.bookmarksite('YTDL-Material', this.generated_bookmarklet_code);
  }

  generateBookmarkletCode() {
    const currentURL = window.location.href.split('#')[0];
    const homePageWithArgsURL = currentURL + '#/home;url=';
    const audioOnly = this.bookmarkletAudioOnly;
    // tslint:disable-next-line: max-line-length
    const bookmarkletCode = `javascript:(function()%7Bwindow.open('${homePageWithArgsURL}' + encodeURIComponent(window.location) + ';audioOnly=${audioOnly}')%7D)()`;
    return bookmarkletCode;
  }

  bookmarkletAudioOnlyChanged(event:  MatCheckboxChange): void {
    this.bookmarkletAudioOnly = event.checked;
    this.generated_bookmarklet_code = this.sanitizer.bypassSecurityTrustUrl(this.generateBookmarkletCode());
  }

  // not currently functioning on most platforms. hence not in use
  bookmarksite(title, url) {
    // Internet Explorer
    if (document.all) {
        window['external']['AddFavorite'](url, title);
    } else if (window['chrome']) {
        // Google Chrome
       this.openSnackBar('Chrome users must drag the \'Alternate URL\' link to your bookmarks.');
    } else if (window['sidebar']) {
        // Firefox
        window['sidebar'].addPanel(title, url, '');
    } else if (window['opera'] && window.print) {
        // Opera
       const elem = document.createElement('a');
       elem.setAttribute('href', url);
       elem.setAttribute('title', title);
       elem.setAttribute('rel', 'sidebar');
       elem.click();
    }
 }

 openArgsModifierDialog() {
   const dialogRef = this.dialog.open(ArgModifierDialogComponent, {
     data: {
      initial_args: this.new_config['Downloader']['custom_args']
     }
   });
   dialogRef.afterClosed().subscribe(new_args => {
    if (new_args !== null && new_args !== undefined) {
      this.new_config['Downloader']['custom_args'] = new_args;
    }
   });
 }

 getLatestGithubRelease() {
    this.postsService.getLatestGithubRelease().subscribe(res => {
      this.latestGithubRelease = res;
    });
  }

  openCookiesUploaderDialog() {
    this.dialog.open(CookiesUploaderDialogComponent, {
      width: '65vw'
    });
  }

  killAllDownloads() {
    const done = new EventEmitter<any>();
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: 'Kill downloads',
        dialogText: 'Are you sure you want to kill all downloads? Any subscription and non-subscription downloads will end immediately, though this operation may take a minute or so to complete.',
        submitText: 'Kill all downloads',
        doneEmitter: done,
        warnSubmitColor: true
      }
    });
    done.subscribe(confirmed => {
      if (confirmed) {
        this.postsService.killAllDownloads().subscribe(res => {
          if (res['success']) {
            dialogRef.close();
            this.postsService.openSnackBar('Successfully killed all downloads!');
          } else {
            dialogRef.close();
            this.postsService.openSnackBar('Failed to kill all downloads! Check logs for details.');
          }
        }, err => {
          dialogRef.close();
          this.postsService.openSnackBar('Failed to kill all downloads! Check logs for details.');
        });
      }
    });
  }

  restartServer() {
    this.postsService.restartServer().subscribe(res => {
      this.postsService.openSnackBar('Restarting!');
    }, err => {
      this.postsService.openSnackBar('Failed to restart the server.');
    });
  }

  getDBInfo() {
    this.postsService.getDBInfo().subscribe(res => {
      this.db_info = res['db_info'];
    });
  }

  transferDB() {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: 'Transfer DB',
        dialogText: `Are you sure you want to transfer the DB?`,
        submitText: 'Transfer',
      }
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this._transferDB();
      }
    });
  }

  _transferDB() {
    this.db_transferring = true;
    this.postsService.transferDB(this.db_info['using_local_db']).subscribe(res => {
      this.db_transferring = false;
      const success = res['success'];
      if (success) {
        this.openSnackBar('Successfully transfered DB! Reloading info...');
        this.getDBInfo();
      } else {
        this.openSnackBar('Failed to transfer DB -- transfer was aborted. Error: ' + res['error']);
      }
    }, err => {
      this.db_transferring = false;
      this.openSnackBar('Failed to transfer DB -- API call failed. See browser logs for details.');
      console.error(err);
    });
  }

  testConnectionString(connection_string) {
    this.testing_connection_string = true;
    this.postsService.testConnectionString(connection_string).subscribe(res => {
      this.testing_connection_string = false;
      if (res['success']) {
        this.postsService.openSnackBar('Connection successful!');
      } else {
        this.postsService.openSnackBar('Connection failed! Error: ' + res['error']);
      }
    }, err => {
      this.testing_connection_string = false;
      this.postsService.openSnackBar('Connection failed! Error: Server error. See logs for more info.');
    });
  }

  // snackbar helper
  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
