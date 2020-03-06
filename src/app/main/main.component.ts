import { Component, OnInit, ElementRef, ViewChild, ViewChildren, QueryList, isDevMode } from '@angular/core';
import {PostsService} from '../posts.services';
import {FileCardComponent} from '../file-card/file-card.component';
import { Observable } from 'rxjs/Observable';
import {FormControl, Validators} from '@angular/forms';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {MatSnackBar, MatDialog} from '@angular/material';
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
import { Router, ActivatedRoute } from '@angular/router';
import { CreatePlaylistComponent } from 'app/create-playlist/create-playlist.component';
import { Platform } from '@angular/cdk/platform';
import { v4 as uuid } from 'uuid';

export let audioFilesMouseHovering = false;
export let videoFilesMouseHovering = false;
export let audioFilesOpened = false;
export let videoFilesOpened = false;

export interface Download {
  uid: string;
  type: string;
  url: string;
  percent_complete: number;
  downloading: boolean;
  is_playlist: boolean;
  fileNames?: string[];
}

@Component({
  selector: 'app-root',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {
  youtubeAuthDisabledOverride = true;

  iOS = false;

  determinateProgress = false;
  downloadingfile = false;
  audioOnly: boolean;
  multiDownloadMode = false;
  customArgsEnabled = false;
  customArgs = null;
  customOutputEnabled = false;
  customOutput = null;
  youtubeAuthEnabled = false;
  youtubeUsername = null;
  youtubePassword = null;
  urlError = false;
  path = '';
  url = '';
  exists = '';
  percentDownloaded: number;
  autoStartDownload = false;

  // settings
  fileManagerEnabled = false;
  allowQualitySelect = false;
  downloadOnlyMode = false;
  allowMultiDownloadMode = false;
  audioFolderPath;
  videoFolderPath;
  allowAdvancedDownload = false;

  cachedAvailableFormats = {};

  // youtube api
  youtubeSearchEnabled = false;
  youtubeAPIKey = null;
  results_loading = false;
  results_showing = true;
  results = [];

  mp3s: any[] = [];
  mp4s: any[] = [];
  files_cols = null;
  playlists = {'audio': [], 'video': []};
  playlist_thumbnails = {};
  downloading_content = {'audio': {}, 'video': {}};
  downloads: Download[] = [];
  current_download: Download = null;

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
  @ViewChildren('audiofilecard') audioFileCards: QueryList<FileCardComponent>;
  @ViewChildren('videofilecard') videoFileCards: QueryList<FileCardComponent>;
  last_valid_url = '';
  last_url_check = 0;

  test_download: Download = {
    uid: null,
    type: 'audio',
    percent_complete: 0,
    url: 'http://youtube.com/watch?v=17848rufj',
    downloading: true,
    is_playlist: false
  };

  constructor(private postsService: PostsService, private youtubeSearch: YoutubeSearchService, public snackBar: MatSnackBar,
    private router: Router, public dialog: MatDialog, private platform: Platform, private route: ActivatedRoute) {
    this.audioOnly = false;

    // loading config
    this.postsService.loadNavItems().subscribe(res => { // loads settings
      const result = !this.postsService.debugMode ? res['config_file'] : res;
      this.fileManagerEnabled = result['YoutubeDLMaterial']['Extra']['file_manager_enabled'];
      this.downloadOnlyMode = result['YoutubeDLMaterial']['Extra']['download_only_mode'];
      this.allowMultiDownloadMode = result['YoutubeDLMaterial']['Extra']['allow_multi_download_mode'];
      this.audioFolderPath = result['YoutubeDLMaterial']['Downloader']['path-audio'];
      this.videoFolderPath = result['YoutubeDLMaterial']['Downloader']['path-video'];
      this.youtubeSearchEnabled = result['YoutubeDLMaterial']['API'] && result['YoutubeDLMaterial']['API']['use_youtube_API'] &&
          result['YoutubeDLMaterial']['API']['youtube_API_key'];
      this.youtubeAPIKey = this.youtubeSearchEnabled ? result['YoutubeDLMaterial']['API']['youtube_API_key'] : null;
      this.allowQualitySelect = result['YoutubeDLMaterial']['Extra']['allow_quality_select'];
      this.allowAdvancedDownload = result['YoutubeDLMaterial']['Advanced']['allow_advanced_download'];


      if (this.fileManagerEnabled) {
        this.getMp3s();
        this.getMp4s();
      }

      if (this.youtubeSearchEnabled && this.youtubeAPIKey) {
        this.youtubeSearch.initializeAPI(this.youtubeAPIKey);
        this.attachToInput();
      }

      // set final cache items
      if (this.allowAdvancedDownload) {
        if (localStorage.getItem('customArgsEnabled') !== null) {
          this.customArgsEnabled = localStorage.getItem('customArgsEnabled') === 'true';
        }

        if (localStorage.getItem('customOutputEnabled') !== null) {
          this.customOutputEnabled = localStorage.getItem('customOutputEnabled') === 'true';
        }

        if (localStorage.getItem('youtubeAuthEnabled') !== null) {
          this.youtubeAuthEnabled = localStorage.getItem('youtubeAuthEnabled') === 'true';
        }

        // set advanced inputs
        const customArgs = localStorage.getItem('customArgs');
        const customOutput = localStorage.getItem('customOutput');
        const youtubeUsername = localStorage.getItem('youtubeUsername');

        if (customArgs && customArgs !== 'null') { this.customArgs = customArgs };
        if (customOutput && customOutput !== 'null') { this.customOutput = customOutput };
        if (youtubeUsername && youtubeUsername !== 'null') { this.youtubeUsername = youtubeUsername };
      }

      if (this.autoStartDownload) {
        this.downloadClicked();
      }

    }, error => {
      console.log(error);
    });

  }

  // app initialization.
  ngOnInit() {
    this.iOS = this.platform.IOS;

    // get checkboxes
    if (localStorage.getItem('audioOnly') !== null) {
      this.audioOnly = localStorage.getItem('audioOnly') === 'true';
    }

    if (localStorage.getItem('multiDownloadMode') !== null) {
      this.multiDownloadMode = localStorage.getItem('multiDownloadMode') === 'true';
    }

    // check if params exist
    if (this.route.snapshot.paramMap.get('url')) {
      this.url = decodeURIComponent(this.route.snapshot.paramMap.get('url'));
      this.audioOnly = this.route.snapshot.paramMap.get('audioOnly') === 'true';

      // set auto start flag to true
      this.autoStartDownload = true;
    }

    this.setCols();
  }

  // file manager stuff

  getMp3s() {
    this.postsService.getMp3s().subscribe(result => {
      const mp3s = result['mp3s'];
      const playlists = result['playlists'];
      // if they are different
      if (JSON.stringify(this.mp3s) !== JSON.stringify(mp3s)) { this.mp3s = mp3s };
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

        if (videoToExtractThumbnail) { this.playlist_thumbnails[playlist.id] = videoToExtractThumbnail.thumbnailURL; }
      }
    }, error => {
      console.log(error);
    });
  }

  getMp4s() {
    this.postsService.getMp4s().subscribe(result => {
      const mp4s = result['mp4s'];
      const playlists = result['playlists'];
      // if they are different
      if (JSON.stringify(this.mp4s) !== JSON.stringify(mp4s)) { this.mp4s = mp4s };
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

        if (videoToExtractThumbnail) { this.playlist_thumbnails[playlist.id] = videoToExtractThumbnail.thumbnailURL; }
      }
    },
    error => {
      console.log(error);
    });
  }

  public setCols() {
    if (window.innerWidth <= 350) {
      this.files_cols = 1;
    } else if (window.innerWidth <= 500) {
      this.files_cols = 2;
    } else if (window.innerWidth <= 750) {
      this.files_cols = 3
    } else {
      this.files_cols = 4;
    }
  }

  public goToFile(name, isAudio) {
    if (isAudio) {
      this.downloadHelperMp3(name, false, false);
    } else {
      this.downloadHelperMp4(name, false, false);
    }
  }

  public goToPlaylist(playlistID, type) {
    const playlist = this.getPlaylistObjectByID(playlistID, type);
    if (playlist) {
      if (this.downloadOnlyMode) {
        this.downloading_content[type][playlistID] = true;
        this.downloadPlaylist(playlist.fileNames, type, playlist.name, playlistID);
      } else {
        localStorage.setItem('player_navigator', this.router.url);
        const fileNames = playlist.fileNames;
        this.router.navigate(['/player', {fileNames: fileNames.join('|nvr|'), type: type, id: playlistID}]);
      }
    } else {
      // playlist not found
      console.error(`Playlist with ID ${playlistID} not found!`);
    }
  }

  getPlaylistObjectByID(playlistID, type) {
    for (let i = 0; i < this.playlists[type].length; i++) {
      const playlist = this.playlists[type][i];
      if (playlist.id === playlistID) {
        return playlist;
      }
    }
    return null;
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
        this.openSnackBar('Playlist successfully removed.', '');
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
        this.openSnackBar('Playlist successfully removed.', '');
      }
      this.getMp4s();
    });
  }

  // download helpers

  downloadHelperMp3(name, is_playlist = false, forceView = false, new_download = null) {
    this.downloadingfile = false;

    if (new_download && this.current_download !== new_download) {
      // console.log('mismatched downloads');
    } else if (!this.multiDownloadMode || !new_download) {
      // if download only mode, just download the file. no redirect
      if (forceView === false && this.downloadOnlyMode && !this.iOS) {
        if (is_playlist) {
          const zipName = name[0].split(' ')[0] + name[1].split(' ')[0];
          this.downloadPlaylist(name, 'audio', zipName);
        } else {
          this.downloadAudioFile(decodeURI(name));
        }
      } else {
        localStorage.setItem('player_navigator', this.router.url);
        if (is_playlist) {
          this.router.navigate(['/player', {fileNames: name.join('|nvr|'), type: 'audio'}]);
        } else {
          this.router.navigate(['/player', {fileNames: name, type: 'audio'}]);
        }
      }
    }

    // remove download from current downloads
    this.removeDownloadFromCurrentDownloads(new_download);

    // reloads mp3s
    if (this.fileManagerEnabled) {
      this.getMp3s();
      setTimeout(() => {
        this.audioFileCards.forEach(filecard => {
          filecard.onHoverResponse();
        });
      }, 200);
    }
  }

  downloadHelperMp4(name, is_playlist = false, forceView = false, new_download = null) {
    this.downloadingfile = false;

    if (new_download && this.current_download !== new_download) {
      // console.log('mismatched downloads');
    } else if (!this.multiDownloadMode || !new_download) {
      // if download only mode, just download the file. no redirect
      if (forceView === false && this.downloadOnlyMode) {
        if (is_playlist) {
          const zipName = name[0].split(' ')[0] + name[1].split(' ')[0];
          this.downloadPlaylist(name, 'video', zipName);
        } else {
          this.downloadVideoFile(decodeURI(name));
        }
      } else {
        localStorage.setItem('player_navigator', this.router.url);
        if (is_playlist) {
          this.router.navigate(['/player', {fileNames: name.join('|nvr|'), type: 'video'}]);
        } else {
          this.router.navigate(['/player', {fileNames: name, type: 'video'}]);
        }
      }
    }

    // remove download from current downloads
    this.removeDownloadFromCurrentDownloads(new_download);

    // reloads mp4s
    if (this.fileManagerEnabled) {
      this.getMp4s();
      setTimeout(() => {
        this.videoFileCards.forEach(filecard => {
          filecard.onHoverResponse();
        });
      }, 200);
    }
  }

  // download click handler
  downloadClicked() {
    if (this.ValidURL(this.url)) {
      this.urlError = false;
      this.path = '';

      // get common args
      const customArgs = (this.customArgsEnabled ? this.customArgs : null);
      const customOutput = (this.customOutputEnabled ? this.customOutput : null);
      const youtubeUsername = (this.youtubeAuthEnabled && this.youtubeUsername ? this.youtubeUsername : null);
      const youtubePassword = (this.youtubeAuthEnabled && this.youtubePassword ? this.youtubePassword : null);

      // set advanced inputs
      if (this.allowAdvancedDownload) {
        if (customArgs) {
          localStorage.setItem('customArgs', customArgs);
        }
        if (customOutput) {
          localStorage.setItem('customOutput', customOutput);
        }
        if (youtubeUsername) {
          localStorage.setItem('youtubeUsername', youtubeUsername);
        }
      }

      if (this.audioOnly) {
        // create download object
        const new_download: Download = {
          uid: uuid(),
          type: 'audio',
          percent_complete: 0,
          url: this.url,
          downloading: true,
          is_playlist: this.url.includes('playlist')
        };
        this.downloads.push(new_download);
        if (!this.current_download && !this.multiDownloadMode) { this.current_download = new_download };
        this.downloadingfile = true;

        let customQualityConfiguration = null;
        if (this.selectedQuality !== '') {
          const cachedFormatsExists = this.cachedAvailableFormats[this.url] && this.cachedAvailableFormats[this.url]['formats'];
          if (cachedFormatsExists) {
            const audio_formats = this.cachedAvailableFormats[this.url]['formats']['audio'];
            customQualityConfiguration = audio_formats[this.selectedQuality]['format_id'];
          }
        }

        this.postsService.makeMP3(this.url, (this.selectedQuality === '' ? null : this.selectedQuality),
          customQualityConfiguration, customArgs, customOutput, youtubeUsername, youtubePassword).subscribe(posts => {
          // update download object
          new_download.downloading = false;
          new_download.percent_complete = 100;

          const is_playlist = !!(posts['file_names']);
          this.path = is_playlist ? posts['file_names'] : posts['audiopathEncoded'];

          if (this.path !== '-1') {
            this.downloadHelperMp3(this.path, is_playlist, false, new_download);
          }
        }, error => { // can't access server
          this.downloadingfile = false;
          this.openSnackBar('Download failed!', 'OK.');
        });
      } else {
        // create download object
        const new_download: Download = {
          uid: uuid(),
          type: 'video',
          percent_complete: 0,
          url: this.url,
          downloading: true,
          is_playlist: this.url.includes('playlist')
        };
        this.downloads.push(new_download);
        if (!this.current_download && !this.multiDownloadMode) { this.current_download = new_download };
        this.downloadingfile = true;

        let customQualityConfiguration = null;
        const cachedFormatsExists = this.cachedAvailableFormats[this.url] &&  this.cachedAvailableFormats[this.url]['formats'];
        if (cachedFormatsExists) {
          const video_formats = this.cachedAvailableFormats[this.url]['formats']['video'];
          if (video_formats['best_audio_format'] && this.selectedQuality !== '') {
              customQualityConfiguration = video_formats[this.selectedQuality]['format_id'] + '+' + video_formats['best_audio_format'];
          }
        }

        this.postsService.makeMP4(this.url, (this.selectedQuality === '' ? null : this.selectedQuality),
          customQualityConfiguration, customArgs, customOutput, youtubeUsername, youtubePassword).subscribe(posts => {
          // update download object
          new_download.downloading = false;
          new_download.percent_complete = 100;

          const is_playlist = !!(posts['file_names']);
          this.path = is_playlist ? posts['file_names'] : posts['videopathEncoded'];

          if (this.path !== '-1') {
            this.downloadHelperMp4(this.path, is_playlist, false, new_download);
          }
        }, error => { // can't access server
          this.downloadingfile = false;
          this.openSnackBar('Download failed!', 'OK.');
      });
      }

      if (this.multiDownloadMode) {
          this.url = '';
          this.downloadingfile = false;
      }
    } else {
      this.urlError = true;
    }
  }

  // download canceled handler
  cancelDownload(download_to_cancel = null) {
    // if one is provided, cancel that one. otherwise, remove the current one
    if (download_to_cancel) {
      this.removeDownloadFromCurrentDownloads(download_to_cancel)
      return;
    }
    this.downloadingfile = false;
    this.current_download.downloading = false;
    this.current_download = null;
  }

  getDownloadByUID(uid) {
    const index = this.downloads.findIndex(download => download.uid === uid);
    if (index !== -1) {
      return this.downloads[index];
    } else {
      return null;
    }
  }

  removeDownloadFromCurrentDownloads(download_to_remove) {
    const index = this.downloads.indexOf(download_to_remove);
    if (index !== -1) {
      this.downloads.splice(index, 1);
      return true;
    } else {
      return false;
    }
  }

  downloadAudioFile(name) {
    this.downloading_content['audio'][name] = true;
    this.postsService.downloadFileFromServer(name, 'audio').subscribe(res => {
      this.downloading_content['audio'][name] = false;
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
    this.downloading_content['video'][name] = true;
    this.postsService.downloadFileFromServer(name, 'video').subscribe(res => {
      this.downloading_content['video'][name] = false;
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

  downloadPlaylist(fileNames, type, zipName = null, playlistID = null) {
    this.postsService.downloadFileFromServer(fileNames, type, zipName).subscribe(res => {
      if (playlistID) { this.downloading_content[type][playlistID] = false };
      const blob: Blob = res;
      saveAs(blob, zipName + '.zip');
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
    const ytValid = true || reYT.test(str);
    if (valid && ytValid && Date.now() - this.last_url_check > 1000) {
      if (str !== this.last_valid_url && this.allowQualitySelect) {
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
    if (!this.cachedAvailableFormats[url]) {
      this.cachedAvailableFormats[url] = {};
    }
    if (!(this.cachedAvailableFormats[url] && this.cachedAvailableFormats[url]['formats'])) {
      this.cachedAvailableFormats[url]['formats_loading'] = true;
      this.postsService.getFileInfo([url], 'irrelevant', true).subscribe(res => {
        this.cachedAvailableFormats[url]['formats_loading'] = false;
        const infos = res['result'];
        if (!infos || !infos.formats) {
          this.errorFormats(url);
          return;
        }
        const parsed_infos = this.getAudioAndVideoFormats(infos.formats);
        const available_formats = {audio: parsed_infos[0], video: parsed_infos[1]};
        this.cachedAvailableFormats[url]['formats'] = available_formats;
      }, err => {
        this.errorFormats(url);
      });
    }
  }

  errorFormats(url) {
    this.cachedAvailableFormats[url]['formats_loading'] = false;
    console.error('Could not load formats for url ' + url);
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
    this.setCols();
  }

  videoModeChanged(new_val) {
    this.selectedQuality = '';
    localStorage.setItem('audioOnly', new_val.checked.toString());
  }

  multiDownloadModeChanged(new_val) {
    localStorage.setItem('multiDownloadMode', new_val.checked.toString());
  }

  customArgsEnabledChanged(new_val) {
    localStorage.setItem('customArgsEnabled', new_val.checked.toString());
    if (new_val.checked === true && this.customOutputEnabled) {
      this.customOutputEnabled = false;
      localStorage.setItem('customOutputEnabled', 'false');

      this.youtubeAuthEnabled = false;
      localStorage.setItem('youtubeAuthEnabled', 'false');
    }
  }

  customOutputEnabledChanged(new_val) {
    localStorage.setItem('customOutputEnabled', new_val.checked.toString());
    if (new_val.checked === true && this.customArgsEnabled) {
      this.customArgsEnabled = false;
      localStorage.setItem('customArgsEnabled', 'false');
    }
  }

  youtubeAuthEnabledChanged(new_val) {
    localStorage.setItem('youtubeAuthEnabled', new_val.checked.toString());
    if (new_val.checked === true && this.customArgsEnabled) {
      this.customArgsEnabled = false;
      localStorage.setItem('customArgsEnabled', 'false');
    }
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

  accordionEntered(type) {
    if (type === 'audio') {
      audioFilesMouseHovering = true;
      this.audioFileCards.forEach(filecard => {
        filecard.onHoverResponse();
      });
    } else if (type === 'video') {
      videoFilesMouseHovering = true;
      this.videoFileCards.forEach(filecard => {
        filecard.onHoverResponse();
      });
    }
  }

  accordionLeft(type) {
    if (type === 'audio') {
      audioFilesMouseHovering = false;
    } else if (type === 'video') {
      videoFilesMouseHovering = false;
    }
  }

  accordionOpened(type) {
    if (type === 'audio') {
      audioFilesOpened = true;
    } else if (type === 'video') {
      videoFilesOpened = true;
    }
  }

  accordionClosed(type) {
    if (type === 'audio') {
      audioFilesOpened = false;
    } else if (type === 'video') {
      videoFilesOpened = false;
    }
  }

  // creating a playlist
  openCreatePlaylistDialog(type) {
    const dialogRef = this.dialog.open(CreatePlaylistComponent, {
      data: {
        filesToSelectFrom: (type === 'audio') ? this.mp3s : this.mp4s,
        type: type
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        if (type === 'audio') { this.getMp3s() };
        if (type === 'video') { this.getMp4s() };
        this.openSnackBar('Successfully created playlist!', '');
      } else if (result === false) {
        this.openSnackBar('ERROR: failed to create playlist!', '');
      }
    });
  }
}
