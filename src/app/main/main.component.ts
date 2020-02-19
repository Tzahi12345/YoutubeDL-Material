import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import {PostsService} from '../posts.services';
import {FileCardComponent} from '../file-card/file-card.component';
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
import { YoutubeSearchService, Result } from '../youtube-search.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {
  iOS = false;

  determinateProgress = false;
  downloadingfile = false;
  audioOnly: boolean;
  urlError = false;
  path = '';
  url = '';
  exists = '';
  percentDownloaded: number;
  fileManagerEnabled = false;
  downloadOnlyMode = false;
  baseStreamPath;
  audioFolderPath;
  videoFolderPath;

  cachedAvailableFormats = {};

  // youtube api
  youtubeSearchEnabled = false;
  youtubeAPIKey = null;
  results_loading = false;
  results_showing = true;
  results = [];

  mp3s: any[] = [];
  mp4s: any[] = [];
  files_cols = (window.innerWidth <= 450) ? 2 : 4;
  playlists = {'audio': [], 'video': []};
  playlist_thumbnails = {};

  urlForm = new FormControl('', [Validators.required]);

  qualityOptions = {
    'video': [
      {
        'resolution': null,
        'value': '',
        'label': 'Max'
      },
      {
        'resolution': '3840x2160',
        'value': '2160',
        'label': '2160p (4K)'
      },
      {
        'resolution': '2560x1440',
        'value': '1440',
        'label': '1440p'
      },
      {
        'resolution': '1920x1080',
        'value': '1080',
        'label': '1080p'
      },
      {
        'resolution': '1280x720',
        'value': '720',
        'label': '720p'
      },
      {
        'resolution': '720x480',
        'value': '480',
        'label': '480p'
      },
      {
        'resolution': '480x360',
        'value': '360',
        'label': '360p'
      },
      {
        'resolution': '360x240',
        'value': '240',
        'label': '240p'
      },
      {
        'resolution': '256x144',
        'value': '144',
        'label': '144p'
      }
    ],
    'audio': [
      {
        'kbitrate': null,
        'value': '',
        'label': 'Max'
      },
      {
        'kbitrate': '256',
        'value': '256K',
        'label': '256 Kbps'
      },
      {
        'kbitrate': '160',
        'value': '160K',
        'label': '160 Kbps'
      },
      {
        'kbitrate': '128',
        'value': '128K',
        'label': '128 Kbps'
      },
      {
        'kbitrate': '96',
        'value': '96K',
        'label': '96 Kbps'
      },
      {
        'kbitrate': '70',
        'value': '70K',
        'label': '70 Kbps'
      },
      {
        'kbitrate': '50',
        'value': '50K',
        'label': '50 Kbps'
      },
      {
        'kbitrate': '32',
        'value': '32K',
        'label': '32 Kbps'
      }
    ]
  }

  selectedQuality = '';
  formats_loading = false;

  @ViewChild('urlinput', { read: ElementRef, static: false }) urlInput: ElementRef;
  last_valid_url = '';
  last_url_check = 0;

  constructor(private postsService: PostsService, private youtubeSearch: YoutubeSearchService, public snackBar: MatSnackBar,
    private router: Router) {
    this.audioOnly = false;


    // loading config
    this.postsService.loadNavItems().subscribe(result => { // loads settings
      const backendUrl = result['YoutubeDLMaterial']['Host']['backendurl'];
      this.fileManagerEnabled = result['YoutubeDLMaterial']['Extra']['file_manager_enabled'];
      this.downloadOnlyMode = result['YoutubeDLMaterial']['Extra']['download_only_mode'];
      this.baseStreamPath = result['YoutubeDLMaterial']['Downloader']['path-base'];
      this.audioFolderPath = result['YoutubeDLMaterial']['Downloader']['path-audio'];
      this.videoFolderPath = result['YoutubeDLMaterial']['Downloader']['path-video'];
      this.youtubeSearchEnabled = result['YoutubeDLMaterial']['API'] && result['YoutubeDLMaterial']['API']['use_youtube_API'] &&
          result['YoutubeDLMaterial']['API']['youtube_API_key'];
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
      const playlists = result['playlists'];
      this.mp3s = mp3s;
      this.playlists.audio = playlists;

      // get thumbnail url by using first video. this is a temporary hack
      for (let i = 0; i < this.playlists.audio.length; i++) {
        const playlist = this.playlists.audio[i];
        let videoToExtractThumbnail = null;
        for (let j = 0; j < this.mp3s.length; j++) {
          if (this.mp3s[j].id === playlist.fileNames[0]) {
            // found the corresponding file
            videoToExtractThumbnail = this.mp3s[j];
          }
        }

        this.playlist_thumbnails[playlist.id] = videoToExtractThumbnail.thumbnailURL;
      }
    }, error => {
      console.log(error);
    });
  }

  getMp4s() {
    this.postsService.getMp4s().subscribe(result => {
      const mp4s = result['mp4s'];
      const playlists = result['playlists'];
      this.mp4s = mp4s;
      this.playlists.video = playlists;

      // get thumbnail url by using first video. this is a temporary hack
      for (let i = 0; i < this.playlists.video.length; i++) {
        const playlist = this.playlists.video[i];
        let videoToExtractThumbnail = null;
        for (let j = 0; j < this.mp4s.length; j++) {
          if (this.mp4s[j].id === playlist.fileNames[0]) {
            // found the corresponding file
            videoToExtractThumbnail = this.mp4s[j];
          }
        }

        this.playlist_thumbnails[playlist.id] = videoToExtractThumbnail.thumbnailURL;
      }
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

  public goToPlaylist(playlistID, type) {
    for (let i = 0; i < this.playlists[type].length; i++) {
      const playlist = this.playlists[type][i];
      if (playlist.id === playlistID) {
        // found the playlist, now go to it
        const fileNames = playlist.fileNames;
        this.router.navigate(['/player', {fileNames: fileNames.join('|nvr|'), type: type, id: playlistID}]);
      }
    }
  }

  public removeFromMp3(name: string) {
    for (let i = 0; i < this.mp3s.length; i++) {
      if (this.mp3s[i].id === name) {
        this.mp3s.splice(i, 1);
      }
    }
  }

  public removePlaylistMp3(playlistID, index) {
    this.postsService.removePlaylist(playlistID, 'audio').subscribe(res => {
      if (res['success']) {
        this.playlists.audio.splice(index, 1);
      }
      this.getMp3s();
    });
  }

  public removeFromMp4(name: string) {
    for (let i = 0; i < this.mp4s.length; i++) {
      if (this.mp4s[i].id === name) {
        this.mp4s.splice(i, 1);
      }
    }
  }

  public removePlaylistMp4(playlistID, index) {
    this.postsService.removePlaylist(playlistID, 'video').subscribe(res => {
      if (res['success']) {
        this.playlists.video.splice(index, 1);
      }
      this.getMp4s();
    });
  }


  // app initialization.
  ngOnInit() {
    this.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window['MSStream'];
  }

  // download helpers

  downloadHelperMp3(name, is_playlist = false, forceView = false) {
    this.downloadingfile = false;

    // if download only mode, just download the file. no redirect
    if (forceView === false && this.downloadOnlyMode && !this.iOS) {
      if (is_playlist) {
        for (let i = 0; i < name.length; i++) {
          this.downloadAudioFile(decodeURI(name[i]));
        }
      } else {
        this.downloadAudioFile(decodeURI(name));
      }
    } else {
      if (is_playlist) {
        this.router.navigate(['/player', {fileNames: name.join('|nvr|'), type: 'audio'}]);
        // window.location.href = this.baseStreamPath + this.audioFolderPath + name[0] + '.mp3';
      } else {
        this.router.navigate(['/player', {fileNames: name, type: 'audio'}]);
        // window.location.href = this.baseStreamPath + this.audioFolderPath + name + '.mp3';
      }
    }

    // reloads mp3s
    if (this.fileManagerEnabled) {
      this.getMp3s();
    }
  }

  downloadHelperMp4(name, is_playlist = false, forceView = false) {
    this.downloadingfile = false;

    // if download only mode, just download the file. no redirect
    if (forceView === false && this.downloadOnlyMode) {
      if (is_playlist) {
        for (let i = 0; i < name.length; i++) {
          this.downloadVideoFile(decodeURI(name[i]));
        }
      } else {
        this.downloadVideoFile(decodeURI(name));
      }
    } else {
      if (is_playlist) {
        this.router.navigate(['/player', {fileNames: name.join('|nvr|'), type: 'video'}]);
        // window.location.href = this.baseStreamPath + this.videoFolderPath + name[0] + '.mp4';
      } else {
        this.router.navigate(['/player', {fileNames: name, type: 'video'}]);
        // window.location.href = this.baseStreamPath + this.videoFolderPath + name + '.mp4';
      }
    }

    // reloads mp4s
    if (this.fileManagerEnabled) {
      this.getMp4s();
    }
  }

  // download click handler
  downloadClicked() {
    if (this.ValidURL(this.url)) {
      this.urlError = false;
      this.path = '';

      if (this.audioOnly) {
        this.downloadingfile = true;

        let customQualityConfiguration = null;
        if (this.selectedQuality !== '') {
          const cachedFormatsExists = this.cachedAvailableFormats[this.url];
          if (cachedFormatsExists) {
            const audio_formats = this.cachedAvailableFormats[this.url]['audio'];
            customQualityConfiguration = audio_formats[this.selectedQuality]['format_id'];
          }
        }
        this.postsService.makeMP3(this.url, (this.selectedQuality === '' ? null : this.selectedQuality),
          customQualityConfiguration).subscribe(posts => {
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
        let customQualityConfiguration = null;
        const cachedFormatsExists = this.cachedAvailableFormats[this.url];
        if (cachedFormatsExists) {
          const video_formats = this.cachedAvailableFormats[this.url]['video'];
          if (video_formats['best_audio_format'] && this.selectedQuality !== '') {
              customQualityConfiguration = video_formats[this.selectedQuality]['format_id'] + '+' + video_formats['best_audio_format'];
          }
        }

        this.downloadingfile = true;
        this.postsService.makeMP4(this.url, (this.selectedQuality === '' ? null : this.selectedQuality),
          customQualityConfiguration).subscribe(posts => {
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

      if (!this.fileManagerEnabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(name, true).subscribe(delRes => {
          // reload mp3s
          this.getMp3s();
        });
      }
    });
  }

  downloadVideoFile(name) {
    this.postsService.downloadFileFromServer(name, 'video').subscribe(res => {
      const blob: Blob = res;
      saveAs(blob, name + '.mp4');

      if (!this.fileManagerEnabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(name, false).subscribe(delRes => {
          // reload mp4s
          this.getMp4s();
        });
      }
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
    if (new_val === '' || !new_val) {
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
    const valid = re.test(str);

    if (!valid) { return false; }

    // tslint:disable-next-line: max-line-length
    const youtubeStrRegex = /(?:http(?:s)?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:(?:watch)?\?(?:.*&)?v(?:i)?=|(?:embed|v|vi|user)\/))([^\?&\"'<> #]+)/;
    const reYT = new RegExp(youtubeStrRegex);
    const ytValid = reYT.test(str);
    if (valid && ytValid && Date.now() - this.last_url_check > 1000) {
      if (str !== this.last_valid_url) {
        // get info
        this.getURLInfo(str);
      }
      this.last_valid_url = str;
    }
    return valid;
  }

  // snackbar helper
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

  getURLInfo(url) {
    if (!(this.cachedAvailableFormats[url])) {
      this.formats_loading = true;
      this.postsService.getFileInfo([url], 'irrelevant', true).subscribe(res => {
        if (url === this.url) { this.formats_loading = false; }
        const infos = res['result'];
        const parsed_infos = this.getAudioAndVideoFormats(infos.formats);
        const available_formats = {audio: parsed_infos[0], video: parsed_infos[1]};
        this.cachedAvailableFormats[url] = available_formats;
      });
    }
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
          this.results_loading = false;
          if (this.url !== '' && results && results.length > 0) {
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

  onResize(event) {
    this.files_cols = (event.target.innerWidth <= 450) ? 2 : 4;
  }

  videoModeChanged(new_val) {
    this.selectedQuality = '';
  }

  getAudioAndVideoFormats(formats): any[] {
    const audio_formats = {};
    const video_formats = {};

    for (let i = 0; i < formats.length; i++) {
      const format_obj = {type: null};

      const format = formats[i];
      const format_type = (format.vcodec === 'none') ? 'audio' : 'video';

      format_obj.type = format_type;
      if (format_obj.type === 'audio' && format.abr) {
        const key = format.abr.toString() + 'K';
        format_obj['bitrate'] = format.abr;
        format_obj['format_id'] = format.format_id;
        format_obj['ext'] = format.ext;
        // don't overwrite if not m4a
        if (audio_formats[key]) {
          if (format.ext === 'm4a') {
            audio_formats[key] = format_obj;
          }
        } else {
          audio_formats[key] = format_obj;
        }
      } else if (format_obj.type === 'video') {
        // check if video format is mp4
        const key = format.height.toString();
        if (format.ext === 'mp4') {
          format_obj['height'] = format.height;
          format_obj['acodec'] = format.acodec;
          format_obj['format_id'] = format.format_id;

          // no acodec means no overwrite
          if (!(video_formats[key]) || format_obj['acodec'] !== 'none') {
            video_formats[key] = format_obj;
          }
        }
      }
    }

    video_formats['best_audio_format'] = this.getBestAudioFormatForMp4(audio_formats);

    return [audio_formats, video_formats]
  }

  getBestAudioFormatForMp4(audio_formats) {
    let best_audio_format_for_mp4 = null;
    let best_audio_format_bitrate = 0;
    const available_audio_format_keys = Object.keys(audio_formats);
    for (let i = 0; i < available_audio_format_keys.length; i++) {
      const audio_format_key = available_audio_format_keys[i];
      const audio_format = audio_formats[audio_format_key];
      const is_m4a = audio_format.ext === 'm4a';
      if (is_m4a && audio_format.bitrate > best_audio_format_bitrate) {
        best_audio_format_for_mp4 = audio_format.format_id;
        best_audio_format_bitrate = audio_format.bitrate;
      }
    }
    return best_audio_format_for_mp4;
  }
}

