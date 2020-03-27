import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { CheckOrSetPinDialogComponent } from 'app/dialogs/check-or-set-pin-dialog/check-or-set-pin-dialog.component';
import { isoLangs } from './locales_list';
import { MatSnackBar } from '@angular/material/snack-bar';
import {DomSanitizer} from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ArgModifierDialogComponent } from 'app/dialogs/arg-modifier-dialog/arg-modifier-dialog.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  all_locales = isoLangs;
  supported_locales = ['en', 'es'];
  initialLocale = localStorage.getItem('locale');

  initial_config = null;
  new_config = null
  loading_config = false;
  generated_bookmarklet_code = null;

  _settingsSame = true;

  get settingsAreTheSame() {
    this._settingsSame = this.settingsSame()
    return this._settingsSame;
  }

  set settingsAreTheSame(val) {
    this._settingsSame = val;
  }

  constructor(private postsService: PostsService, private snackBar: MatSnackBar, private sanitizer: DomSanitizer,
    private dialog: MatDialog) { }

  ngOnInit() {
    this.getConfig();

    this.generated_bookmarklet_code = this.sanitizer.bypassSecurityTrustUrl(this.generateBookmarkletCode());
  }

  getConfig() {
    this.loading_config = true;
    this.postsService.loadNavItems().subscribe(res => {
      this.loading_config = false;
      // successfully loaded config

      this.initial_config = !this.postsService.debugMode ? res['config_file']['YoutubeDLMaterial'] : res['YoutubeDLMaterial'];
      this.new_config = JSON.parse(JSON.stringify(this.initial_config));
    });
  }

  settingsSame() {
    return JSON.stringify(this.new_config) === JSON.stringify(this.initial_config);
  }

  saveSettings() {
    const settingsToSave = {'YoutubeDLMaterial': this.new_config};
    this.postsService.setConfig(settingsToSave).subscribe(res => {
      if (res['success']) {
        // sets new config as old config
        this.postsService.settings_changed.next(true);
        this.initial_config = JSON.parse(JSON.stringify(this.new_config));
      }
    }, err => {
      console.error('Failed to save config!');
    })
  }

  setNewPin() {
    const dialogRef = this.dialog.open(CheckOrSetPinDialogComponent, {
      data: {
        resetMode: true
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
    const bookmarkletCodeInside = `'${homePageWithArgsURL}' + window.location`
    const bookmarkletCode = `javascript:(function()%7Bwindow.open('${homePageWithArgsURL}' + encodeURIComponent(window.location))%7D)()`;
    return bookmarkletCode;
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
     if (new_args) {
      this.new_config['Downloader']['custom_args'] = new_args;
     }
   });
 }

  // snackbar helper
  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
