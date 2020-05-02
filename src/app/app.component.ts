import { Component, OnInit, ElementRef, ViewChild, HostBinding } from '@angular/core';
import {PostsService} from './posts.services';
import {FileCardComponent} from './file-card/file-card.component';
import { Observable } from 'rxjs/Observable';
import {FormControl, Validators} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSidenav } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { saveAs } from 'file-saver';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/observable/fromEvent'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/debounceTime'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/switch'
import { YoutubeSearchService, Result } from './youtube-search.service';
import { Router, NavigationStart, NavigationEnd } from '@angular/router';
import { OverlayContainer } from '@angular/cdk/overlay';
import { THEMES_CONFIG } from '../themes';
import { SettingsComponent } from './settings/settings.component';
import { CheckOrSetPinDialogComponent } from './dialogs/check-or-set-pin-dialog/check-or-set-pin-dialog.component';
import { AboutDialogComponent } from './dialogs/about-dialog/about-dialog.component';
import { UserProfileDialogComponent } from './dialogs/user-profile-dialog/user-profile-dialog.component';
import { SetDefaultAdminDialogComponent } from './dialogs/set-default-admin-dialog/set-default-admin-dialog.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  @HostBinding('class') componentCssClass;
  THEMES_CONFIG = THEMES_CONFIG;

  // config items
  topBarTitle = 'Youtube Downloader';
  defaultTheme = null;
  allowThemeChange = null;
  allowSubscriptions = false;
  enableDownloadsManager = false;
  // defaults to true to prevent attack
  settingsPinRequired = true;

  @ViewChild('sidenav') sidenav: MatSidenav;
  @ViewChild('hamburgerMenu', { read: ElementRef }) hamburgerMenuButton: ElementRef;
  navigator: string = null;

  constructor(public postsService: PostsService, public snackBar: MatSnackBar, private dialog: MatDialog,
    public router: Router, public overlayContainer: OverlayContainer, private elementRef: ElementRef) {

    this.navigator = localStorage.getItem('player_navigator');
    // runs on navigate, captures the route that navigated to the player (if needed)
    this.router.events.subscribe((e) => { if (e instanceof NavigationStart) {
      this.navigator = localStorage.getItem('player_navigator');
    } else if (e instanceof NavigationEnd) {
      // blurs hamburger menu if it exists, as the sidenav likes to focus on it after closing
      if (this.hamburgerMenuButton && this.hamburgerMenuButton.nativeElement) {
        this.hamburgerMenuButton.nativeElement.blur();
      }
    }
    });

    this.postsService.config_reloaded.subscribe(changed => {
      if (changed) {
        this.loadConfig();
      }
    });

  }

  toggleSidenav() {
    this.sidenav.toggle();
  }

  loadConfig() {
    // loading config
    this.topBarTitle = this.postsService.config['Extra']['title_top'];
    this.settingsPinRequired = this.postsService.config['Extra']['settings_pin_required'];
    const themingExists = this.postsService.config['Themes'];
    this.defaultTheme = themingExists ? this.postsService.config['Themes']['default_theme'] : 'default';
    this.allowThemeChange = themingExists ? this.postsService.config['Themes']['allow_theme_change'] : true;
    this.allowSubscriptions = this.postsService.config['Subscriptions']['allow_subscriptions'];
    this.enableDownloadsManager = this.postsService.config['Extra']['enable_downloads_manager'];

    // sets theme to config default if it doesn't exist
    if (!localStorage.getItem('theme')) {
      this.setTheme(themingExists ? this.defaultTheme : 'default');
    }
  }

  // theme stuff

  setTheme(theme) {
    // theme is registered, so set it to the stored cookie variable
    let old_theme = null;
    if (this.THEMES_CONFIG[theme]) {
        if (localStorage.getItem('theme')) {
          old_theme = localStorage.getItem('theme');
          if (!this.THEMES_CONFIG[old_theme]) {
            console.log('bad theme found, setting to default');
            if (this.defaultTheme === null) {
              // means it hasn't loaded yet
              console.error('No default theme detected');
            } else {
              localStorage.setItem('theme', this.defaultTheme);
              old_theme = localStorage.getItem('theme'); // updates old_theme
            }
          }
        }
        localStorage.setItem('theme', theme);
        this.elementRef.nativeElement.ownerDocument.body.style.backgroundColor = this.THEMES_CONFIG[theme]['background_color'];
    } else {
        console.error('Invalid theme: ' + theme);
        return;
    }

    this.postsService.setTheme(theme);

    this.onSetTheme(this.THEMES_CONFIG[theme]['css_label'], old_theme ? this.THEMES_CONFIG[old_theme]['css_label'] : old_theme);
}

onSetTheme(theme, old_theme) {
    if (old_theme) {
      document.body.classList.remove(old_theme);
      this.overlayContainer.getContainerElement().classList.remove(old_theme);
    }
    this.overlayContainer.getContainerElement().classList.add(theme);
    this.componentCssClass = theme;
  }

  flipTheme() {
    if (this.postsService.theme.key === 'default') {
      this.setTheme('dark');
    } else if (this.postsService.theme.key === 'dark') {
      this.setTheme('default');
    }
  }

  themeMenuItemClicked(event) {
    this.flipTheme();
    event.stopPropagation();
  }

  ngOnInit() {
    if (localStorage.getItem('theme')) {
      this.setTheme(localStorage.getItem('theme'));
    } else {
    //
    }
    this.postsService.open_create_default_admin_dialog.subscribe(open => {
      if (open) {
        const dialogRef = this.dialog.open(SetDefaultAdminDialogComponent);
        dialogRef.afterClosed().subscribe(success => {
          if (success) {
            if (this.router.url !== '/login') { this.router.navigate(['/login']); }
          } else {
            console.error('Failed to create default admin account. See logs for details.');
          }
        });
      }
    });
  }


  goBack() {
    if (!this.navigator) {
      this.router.navigate(['/home']);
    } else {
      this.router.navigateByUrl(this.navigator);
    }
  }

  openSettingsDialog() {
    if (this.settingsPinRequired) {
      this.openPinDialog();
    } else {
      this.actuallyOpenSettingsDialog();
    }
  }

  actuallyOpenSettingsDialog() {
    const dialogRef = this.dialog.open(SettingsComponent, {
      width: '80vw'
    });
  }

  openPinDialog() {
    const dialogRef = this.dialog.open(CheckOrSetPinDialogComponent, {
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res) {
        this.actuallyOpenSettingsDialog();
      }
    });

  }

  openAboutDialog() {
    const dialogRef = this.dialog.open(AboutDialogComponent, {
      width: '80vw'
    });
  }

  openProfileDialog() {
    const dialogRef = this.dialog.open(UserProfileDialogComponent, {
      width: '60vw'
    });
  }

}

