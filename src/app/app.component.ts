import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
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

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  iOS = false;

  determinateProgress = false;
  downloadingfile = false;
  audioOnly: boolean;
  urlError = false;
  path = '';
  url = '';
  exists = '';
  topBarTitle = 'Youtube Downloader';
  percentDownloaded: number;
  fileManagerEnabled = false;
  downloadOnlyMode = false;
  baseStreamPath;
  audioFolderPath;
  videoFolderPath;

  // youtube api
  youtubeSearchEnabled = false;
  youtubeAPIKey = null;
  results_loading = false;
  results_showing = true;
  results = [];

  mp3s: any[] = [];
  mp4s: any[] = [];
  files_cols = (window.innerWidth <= 450) ? 2 : 4;

  urlForm = new FormControl('', [Validators.required]);

  @ViewChild('urlinput', { read: ElementRef, static: false }) urlInput: ElementRef;

  constructor(private postsService: PostsService, private youtubeSearch: YoutubeSearchService, public snackBar: MatSnackBar,
    public router: Router) {
    this.audioOnly = false;


    // loading config
    this.postsService.loadNavItems().subscribe(result => { // loads settings
      this.topBarTitle = result['YoutubeDLMaterial']['Extra']['title_top'];
    }, error => {
      console.log(error);
    });

  }

  ngOnInit() {
    
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}

