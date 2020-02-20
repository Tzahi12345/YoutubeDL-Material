import { Component, OnInit, ElementRef, ViewChild, HostBinding } from '@angular/core';
import {PostsService} from './posts.services';
import {FileCardComponent} from './file-card/file-card.component';
import { Observable } from 'rxjs/Observable';
import {FormControl, Validators} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {MatSnackBar} from '@angular/material';
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
import { Router } from '@angular/router';
import { OverlayContainer } from '@angular/cdk/overlay';
import { THEMES_CONFIG } from '../themes';

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

  @ViewChild('urlinput', { read: ElementRef, static: false }) urlInput: ElementRef;

  constructor(public postsService: PostsService, public snackBar: MatSnackBar,
    public router: Router, public overlayContainer: OverlayContainer) {

    // loading config
    this.postsService.loadNavItems().subscribe(result => { // loads settings
      this.topBarTitle = result['YoutubeDLMaterial']['Extra']['title_top'];
      const themingExists = result['YoutubeDLMaterial']['Themes'];
      this.defaultTheme = themingExists ? result['YoutubeDLMaterial']['Themes']['default_theme'] : 'default';
      this.allowThemeChange = themingExists ? result['YoutubeDLMaterial']['Themes']['allow_theme_change'] : true;

      // sets theme to config default if it doesn't exist
      if (!localStorage.getItem('theme')) {
        this.setTheme(themingExists ? this.defaultTheme : 'default');
      }
    }, error => {
      console.log(error);
    });

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

  ngOnInit() {
    if (localStorage.getItem('theme')) {
      this.setTheme(localStorage.getItem('theme'));
    } else {
    //
    }
  }


  goBack() {
    this.router.navigate(['/home']);
  }
}

