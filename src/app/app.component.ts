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

  urlForm = new FormControl('', [Validators.required]);

  @ViewChild('urlinput', { read: ElementRef, static: false }) urlInput: ElementRef;

  constructor(private postsService: PostsService, private youtubeSearch: YoutubeSearchService, public snackBar: MatSnackBar) {
    this.audioOnly = false;


    // loading config
    this.postsService.loadNavItems().subscribe(result => { // loads settings
      const backendUrl = result['YoutubeDLMaterial']['Host']['backendurl'];
      this.topBarTitle = result['YoutubeDLMaterial']['Extra']['title_top'];
      this.fileManagerEnabled = result['YoutubeDLMaterial']['Extra']['file_manager_enabled'];
      this.downloadOnlyMode = result['YoutubeDLMaterial']['Extra']['download_only_mode'];
      this.baseStreamPath = result['YoutubeDLMaterial']['Downloader']['path-base'];
      this.audioFolderPath = result['YoutubeDLMaterial']['Downloader']['path-audio'];
      this.videoFolderPath = result['YoutubeDLMaterial']['Downloader']['path-video'];
      this.youtubeSearchEnabled = result['YoutubeDLMaterial']['API'] && result['YoutubeDLMaterial']['API']['use_youtube_API'];
      this.youtubeAPIKey = this.youtubeSearchEnabled ? result['YoutubeDLMaterial']['API']['youtube_API_key'] : null;

      this.postsService.path = backendUrl;
      this.postsService.startPath = backendUrl;
      this.postsService.startPathSSL = backendUrl;

      if (this.fileManagerEnabled) {
        this.getMp3s();
        this.getMp4s();
      }

      if (this.youtubeSearchEnabled && this.youtubeAPIKey) {
        this.youtubeSearch.initializeAPI(this.youtubeAPIKey);
        this.attachToInput();
      }
    }, error => {
      console.log(error);
    });

  }

  // file manager stuff

  getMp3s() {
    this.postsService.getMp3s().subscribe(result => {
      const mp3s = result['mp3s'];
      this.mp3s = mp3s;
    }, error => {
      console.log(error);
    });
  }

  getMp4s() {
    this.postsService.getMp4s().subscribe(result => {
      const mp4s = result['mp4s'];
      this.mp4s = mp4s;
    },
    error => {
      console.log(error);
    });
  }

  public goToFile(name, isAudio) {
    if (isAudio) {
      this.downloadHelperMp3(name, false, true);
    } else {
      this.downloadHelperMp4(name, false, true);
    }
  }

  public removeFromMp3(name: string) {
    for (let i = 0; i < this.mp3s.length; i++) {
      if (this.mp3s[i].id === name) {
        this.mp3s.splice(i, 1);
      }
    }
  }

  public removeFromMp4(name: string) {
    // console.log(name);
    // console.log(this.mp4s);
    for (let i = 0; i < this.mp4s.length; i++) {
      if (this.mp4s[i].id === name) {
        this.mp4s.splice(i, 1);
      }
    }
  }

  // app initialization.
  ngOnInit() {
    this.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window['MSStream'];
  }

  // download helpers

  downloadHelperMp3(name, is_playlist = false, forceView = false) {
    /*
    this.postsService.getFileStatusMp3(name).subscribe(fileExists => {
      const exists = fileExists;
      this.exists = exists[0];
      if (exists[0] === 'failed') {
        const percent = exists[2];
        // console.log(percent);
        if (percent > 0.30) {
          this.determinateProgress = true;
          this.percentDownloaded = percent * 100;
        }
        setTimeout(() => this.downloadHelperMp3(name, is_playlist, forceView), 500);
      } else {
        */
        this.downloadingfile = false;

        // if download only mode, just download the file. no redirect
        if (forceView === false && this.downloadOnlyMode && !this.iOS) {
          if (is_playlist) {
            for (let i = 0; i < name.length; i++) {
              this.downloadAudioFile(name[i]);
            }
          } else {
            this.downloadAudioFile(name);
          }
        } else {
          if (is_playlist) {
            window.location.href = this.baseStreamPath + this.audioFolderPath + name[0];
          } else {
            window.location.href = this.baseStreamPath + this.audioFolderPath + name;
          }
        }

        // reloads mp3s
        if (this.fileManagerEnabled) {
          this.getMp3s();
        }
      /* }
    });*/

  }

  downloadHelperMp4(name, is_playlist = false, forceView = false) {
    /*
    this.postsService.getFileStatusMp4(name).subscribe(fileExists => {
      const exists = fileExists;
      this.exists = exists[0];
      if (exists[0] === 'failed') {
        const percent = exists[2];
        if (percent > 0.30) {
          this.determinateProgress = true;
          this.percentDownloaded = percent * 100;
        }
        setTimeout(() => this.downloadHelperMp4(name, is_playlist, forceView), 500);
      } else {
        */
        this.downloadingfile = false;

        // if download only mode, just download the file. no redirect
        if (forceView === false && this.downloadOnlyMode) {
          if (is_playlist) {
            for (let i = 0; i < name.length; i++) {
              this.downloadVideoFile(name[i]);
            }
          } else {
            this.downloadVideoFile(name);
          }
        } else {
          if (is_playlist) {
            window.location.href = this.baseStreamPath + this.videoFolderPath + name[0];
          } else {
            window.location.href = this.baseStreamPath + this.videoFolderPath + name;
          }
        }

        // reloads mp4s
        if (this.fileManagerEnabled) {
          this.getMp4s();
        }
        /*
      }
    });
    */

  }

  // download click handler
  downloadClicked() {
    if (this.ValidURL(this.url)) {
      this.urlError = false;
      this.path = '';

      if (this.audioOnly) {
        this.downloadingfile = true;
        this.postsService.makeMP3(this.url).subscribe(posts => {
          const is_playlist = !!(posts['file_names']);
          this.path = is_playlist ? posts['file_names'] : posts['audiopathEncoded'];
          if (this.path !== '-1') {
            this.downloadHelperMp3(this.path, is_playlist);
          }
        }, error => { // can't access server
          this.downloadingfile = false;
          this.openSnackBar('Download failed!', 'OK.');
        });
      } else {
        this.downloadingfile = true;
        this.postsService.makeMP4(this.url).subscribe(posts => {
          const is_playlist = !!(posts['file_names']);
          this.path = is_playlist ? posts['file_names'] : posts['videopathEncoded'];
          if (this.path !== '-1') {
            this.downloadHelperMp4(this.path, is_playlist);
          }
        }, error => { // can't access server
          this.downloadingfile = false;
          this.openSnackBar('Download failed!', 'OK.');
      });
      }
    } else {
      this.urlError = true;
    }
  }

  downloadAudioFile(name) {
    this.postsService.downloadFileFromServer(name, 'audio').subscribe(res => {
      const blob: Blob = res;
      saveAs(blob, name + '.mp3');

      // tell server to delete the file once downloaded
      this.postsService.deleteFile(name, true).subscribe(delRes => {

      });
    });
  }

  downloadVideoFile(name) {
    this.postsService.downloadFileFromServer(name, 'video').subscribe(res => {
      const blob: Blob = res;
      saveAs(blob, name + '.mp4');

      // tell server to delete the file once downloaded
      this.postsService.deleteFile(name, false).subscribe(delRes => {

      });
    });
  }

  clearInput() {
    this.url = '';
    this.results_showing = false;
  }

  onInputBlur() {
    this.results_showing = false;
  }

  visitURL(url) {
    window.open(url);
  }

  useURL(url) {
    this.results_showing = false;
    this.url = url;
  }

  inputChanged(new_val) {
    if (new_val === '') {
      this.results_showing = false;
    } else {
      if (this.ValidURL(new_val)) {
        this.results_showing = false;
      }
    }
  }

  // checks if url is a valid URL
  ValidURL(str) {
    // tslint:disable-next-line: max-line-length
    const strRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/;
    const re = new RegExp(strRegex);
    return re.test(str);
  }

  // snackbar helper
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

  attachToInput() {
    Observable.fromEvent(this.urlInput.nativeElement, 'keyup')
      .map((e: any) => e.target.value)           // extract the value of input
      .filter((text: string) => text.length > 1) // filter out if empty
      .debounceTime(250)                         // only once every 250ms
      .do(() => this.results_loading = true)         // enable loading
      .map((query: string) => this.youtubeSearch.search(query))
      .switch()                                  // act on the return of the search
      .subscribe(
        (results: Result[]) => {
          // console.log(results);
          this.results_loading = false;
          if (results && results.length > 0) {
            this.results = results;
            this.results_showing = true;
          } else {
            this.results_showing = false;
          }
        },
        (err: any) => {
          console.log(err)
          this.results_loading = false;
          this.results_showing = false;
        },
        () => { // on completion
          this.results_loading = false;
        }
      );
  }
}

