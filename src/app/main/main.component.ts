import { Component, OnInit, ElementRef, ViewChild, ViewChildren, QueryList } from '@angular/core';
import {PostsService} from '../posts.services';
import {FileCardComponent} from '../file-card/file-card.component';
import { Observable } from 'rxjs/Observable';
import {FormControl, Validators} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
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
import { YoutubeSearchService, Result } from '../youtube-search.service';
import { Router, ActivatedRoute } from '@angular/router';
import { CreatePlaylistComponent } from 'app/create-playlist/create-playlist.component';
import { Platform } from '@angular/cdk/platform';
import { v4 as uuid } from 'uuid';
import { ArgModifierDialogComponent } from 'app/dialogs/arg-modifier-dialog/arg-modifier-dialog.component';

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
  error: boolean | string;
  fileNames?: string[];
  complete?: boolean;
  timestamp_start?: number;
  timestamp_end?: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {
  youtubeAuthDisabledOverride = false;

  iOS = false;

  // local settings
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

  // global settings
  fileManagerEnabled = false;
  allowQualitySelect = false;
  downloadOnlyMode = false;
  allowMultiDownloadMode = false;
  audioFolderPath;
  videoFolderPath;
  use_youtubedl_archive = false;
  globalCustomArgs = null;
  allowAdvancedDownload = false;
  useDefaultDownloadingAgent = true;
  customDownloadingAgent = null;

  // cache
  cachedAvailableFormats = {};
  cachedFileManagerEnabled = localStorage.getItem('cached_filemanager_enabled') === 'true';

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

  @ViewChild('urlinput', { read: ElementRef }) urlInput: ElementRef;
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
    is_playlist: false,
    error: false
  };

  simulatedOutput = '';

  constructor(public postsService: PostsService, private youtubeSearch: YoutubeSearchService, public snackBar: MatSnackBar,
    private router: Router, public dialog: MatDialog, private platform: Platform, private route: ActivatedRoute) {
    this.audioOnly = false;
  }

  async configLoad() {
    await this.loadConfig();
    if (this.autoStartDownload) {
      this.downloadClicked();
    }

    setInterval(() => this.getSimulatedOutput(), 1000);
  }

  async loadConfig() {
    // loading config
    this.fileManagerEnabled = this.postsService.config['Extra']['file_manager_enabled']
                              && (!this.postsService.isLoggedIn || this.postsService.permissions.includes('filemanager'));
    this.downloadOnlyMode = this.postsService.config['Extra']['download_only_mode'];
    this.allowMultiDownloadMode = this.postsService.config['Extra']['allow_multi_download_mode'];
    this.audioFolderPath = this.postsService.config['Downloader']['path-audio'];
    this.videoFolderPath = this.postsService.config['Downloader']['path-video'];
    this.use_youtubedl_archive = this.postsService.config['Downloader']['use_youtubedl_archive'];
    this.globalCustomArgs = this.postsService.config['Downloader']['custom_args'];
    this.youtubeSearchEnabled = this.postsService.config['API'] && this.postsService.config['API']['use_youtube_API'] &&
        this.postsService.config['API']['youtube_API_key'];
    this.youtubeAPIKey = this.youtubeSearchEnabled ? this.postsService.config['API']['youtube_API_key'] : null;
    this.allowQualitySelect = this.postsService.config['Extra']['allow_quality_select'];
    this.allowAdvancedDownload = this.postsService.config['Advanced']['allow_advanced_download']
                                  && (!this.postsService.isLoggedIn || this.postsService.permissions.includes('advanced_download'));
    this.useDefaultDownloadingAgent = this.postsService.config['Advanced']['use_default_downloading_agent'];
    this.customDownloadingAgent = this.postsService.config['Advanced']['custom_downloading_agent'];



    if (this.fileManagerEnabled) {
      this.getMp3s();
      this.getMp4s();
    }

    if (this.youtubeSearchEnabled && this.youtubeAPIKey) {
      this.youtubeSearch.initializeAPI(this.youtubeAPIKey);
      this.attachToInput();
    }

    // set final cache items

    localStorage.setItem('cached_filemanager_enabled', this.fileManagerEnabled.toString());
    this.cachedFileManagerEnabled = this.fileManagerEnabled;

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

    // get downloads routine
    setInterval(() => {
      if (this.current_download) {
        this.getCurrentDownload();
      }
    }, 500);

    return true;
  }

  // app initialization.
  ngOnInit() {
    if (this.postsService.initialized) {
      this.configLoad();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.configLoad();
        }
      });
    }

    this.postsService.config_reloaded.subscribe(changed => {
      if (changed) {
        this.loadConfig();
      }
    });

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

  public goToFile(name, isAudio, uid) {
    if (isAudio) {
      this.downloadHelperMp3(name, uid, false, false, null, true);
    } else {
      this.downloadHelperMp4(name, uid, false, false, null, true);
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
        this.router.navigate(['/player', {fileNames: fileNames.join('|nvr|'), type: type, id: playlistID, uid: playlistID}]);
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
      if (this.mp3s[i].id === name || this.mp3s[i].id + '.mp3' === name) {
        this.mp3s.splice(i, 1);
      }
    }
    this.getMp3s();
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
      if (this.mp4s[i].id === name || this.mp4s[i].id + '.mp4' === name) {
        this.mp4s.splice(i, 1);
      }
    }
    this.getMp4s();
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

  downloadHelperMp3(name, uid, is_playlist = false, forceView = false, new_download = null, navigate_mode = false) {
    this.downloadingfile = false;
    if (this.multiDownloadMode && !this.downloadOnlyMode && !navigate_mode) {
      // do nothing
    } else {
      // if download only mode, just download the file. no redirect
      if (forceView === false && this.downloadOnlyMode && !this.iOS) {
        if (is_playlist) {
          const zipName = name[0].split(' ')[0] + name[1].split(' ')[0];
          this.downloadPlaylist(name, 'audio', zipName);
        } else {
          this.downloadAudioFile(decodeURI(name));
        }
      } else {
        localStorage.setItem('player_navigator', this.router.url.split(';')[0]);
        if (is_playlist) {
          this.router.navigate(['/player', {fileNames: name.join('|nvr|'), type: 'audio'}]);
        } else {
          this.router.navigate(['/player', {type: 'audio', uid: uid}]);
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

  downloadHelperMp4(name, uid, is_playlist = false, forceView = false, new_download = null, navigate_mode = false) {
    this.downloadingfile = false;
    if (this.multiDownloadMode && !this.downloadOnlyMode && !navigate_mode) {
      // do nothing
    } else {
      // if download only mode, just download the file. no redirect
      if (forceView === false && this.downloadOnlyMode) {
        if (is_playlist) {
          const zipName = name[0].split(' ')[0] + name[1].split(' ')[0];
          this.downloadPlaylist(name, 'video', zipName);
        } else {
          this.downloadVideoFile(decodeURI(name));
        }
      } else {
        localStorage.setItem('player_navigator', this.router.url.split(';')[0]);
        if (is_playlist) {
          this.router.navigate(['/player', {fileNames: name.join('|nvr|'), type: 'video'}]);
        } else {
          this.router.navigate(['/player', {type: 'video', uid: uid}]);
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
          is_playlist: this.url.includes('playlist'),
          error: false
        };
        this.downloads.push(new_download);
        if (!this.current_download && !this.multiDownloadMode) { this.current_download = new_download };
        this.downloadingfile = true;

        let customQualityConfiguration = null;
        if (this.selectedQuality !== '') {
          customQualityConfiguration = this.getSelectedAudioFormat();
        }

        this.postsService.makeMP3(this.url, (this.selectedQuality === '' ? null : this.selectedQuality),
          customQualityConfiguration, customArgs, customOutput, youtubeUsername, youtubePassword, new_download.uid).subscribe(posts => {
          // update download object
          new_download.downloading = false;
          new_download.percent_complete = 100;

          const is_playlist = !!(posts['file_names']);
          this.path = is_playlist ? posts['file_names'] : posts['audiopathEncoded'];

          this.current_download = null;

          if (this.path !== '-1') {
            this.downloadHelperMp3(this.path, posts['uid'], is_playlist, false, new_download);
          }
        }, error => { // can't access server or failed to download for other reasons
          this.downloadingfile = false;
          this.current_download = null;
          new_download['downloading'] = false;
          // removes download from list of downloads
          const downloads_index = this.downloads.indexOf(new_download);
          if (downloads_index !== -1) {
            this.downloads.splice(downloads_index)
          }
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
          is_playlist: this.url.includes('playlist'),
          error: false
        };
        this.downloads.push(new_download);
        if (!this.current_download && !this.multiDownloadMode) { this.current_download = new_download };
        this.downloadingfile = true;

        const customQualityConfiguration = this.getSelectedVideoFormat();

        this.postsService.makeMP4(this.url, (this.selectedQuality === '' ? null : this.selectedQuality),
          customQualityConfiguration, customArgs, customOutput, youtubeUsername, youtubePassword, new_download.uid).subscribe(posts => {
          // update download object
          new_download.downloading = false;
          new_download.percent_complete = 100;

          const is_playlist = !!(posts['file_names']);
          this.path = is_playlist ? posts['file_names'] : posts['videopathEncoded'];

          this.current_download = null;

          if (this.path !== '-1') {
            this.downloadHelperMp4(this.path, posts['uid'], is_playlist, false, new_download);
          }
        }, error => { // can't access server
          this.downloadingfile = false;
          this.current_download = null;
          new_download['downloading'] = false;
          // removes download from list of downloads
          const downloads_index = this.downloads.indexOf(new_download);
          if (downloads_index !== -1) {
            this.downloads.splice(downloads_index)
          }
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

  getSelectedAudioFormat() {
    if (this.selectedQuality === '') { return null };
    const cachedFormatsExists = this.cachedAvailableFormats[this.url] && this.cachedAvailableFormats[this.url]['formats'];
    if (cachedFormatsExists) {
      const audio_formats = this.cachedAvailableFormats[this.url]['formats']['audio'];
      return audio_formats[this.selectedQuality]['format_id'];
    } else {
      return null;
    }
  }

  getSelectedVideoFormat() {
    if (this.selectedQuality === '') { return null };
    const cachedFormatsExists = this.cachedAvailableFormats[this.url] &&  this.cachedAvailableFormats[this.url]['formats'];
    if (cachedFormatsExists) {
      const video_formats = this.cachedAvailableFormats[this.url]['formats']['video'];
      if (video_formats['best_audio_format'] && this.selectedQuality !== '') {
          return video_formats[this.selectedQuality]['format_id'] + '+' + video_formats['best_audio_format'];
      }
    }
    return null;
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
    if (this.current_download === download_to_remove) {
      this.current_download = null;
    }
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
      saveAs(blob, decodeURIComponent(name) + '.mp3');

      if (!this.fileManagerEnabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(name, 'video').subscribe(delRes => {
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
      saveAs(blob, decodeURIComponent(name) + '.mp4');

      if (!this.fileManagerEnabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(name, 'audio').subscribe(delRes => {
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
    // if url is a youtube playlist, skip getting url info
    if (url.includes('playlist')) {
      return;
    }
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

  getSimulatedOutput() {
    const customArgsExists = this.customArgsEnabled && this.customArgs;
    const globalArgsExists = this.globalCustomArgs && this.globalCustomArgs !== '';

    let full_string_array: string[] = [];
    const base_string_array = ['youtube-dl', this.url];

    if (customArgsExists) {
      this.simulatedOutput = base_string_array.join(' ') + ' ' + this.customArgs.split(',,').join(' ');
      return this.simulatedOutput;
    }

    full_string_array.push(...base_string_array);

    const base_path = this.audioOnly ? this.audioFolderPath : this.videoFolderPath;
    const ext = this.audioOnly ? '.mp3' : '.mp4';
    // gets output
    let output_string_array = ['-o', base_path + '%(title)s' + ext];
    if (this.customOutputEnabled && this.customOutput) {
      output_string_array = ['-o', base_path + this.customOutput + ext];
    }
    // before pushing output, should check if using an external downloader
    if (!this.useDefaultDownloadingAgent && this.customDownloadingAgent === 'aria2c') {
      full_string_array.push('--external-downloader', 'aria2c');
    }
    // pushes output
    full_string_array.push(...output_string_array);

    // logic splits into audio and video modes
    if (this.audioOnly) {
      // adds base audio string
      const format_array = [];
      const audio_format = this.getSelectedAudioFormat();
      if (audio_format) {
        format_array.push('-f', audio_format);
      } else if (this.selectedQuality) {
        format_array.push('--audio-quality', this.selectedQuality);
      }

      // pushes formats
      full_string_array.splice(2, 0, ...format_array);

      const additional_params = ['-x', '--audio-format', 'mp3', '--write-info-json', '--print-json'];

      full_string_array.push(...additional_params);
    } else {
      // adds base video string
      let format_array = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4'];
      const video_format = this.getSelectedVideoFormat();
      if (video_format) {
        format_array = ['-f', video_format];
      } else if (this.selectedQuality) {
        format_array = [`bestvideo[height=${this.selectedQuality}]+bestaudio/best[height=${this.selectedQuality}]`];
      }

      // pushes formats
      full_string_array.splice(2, 0, ...format_array);

      const additional_params = ['--write-info-json', '--print-json'];

      full_string_array.push(...additional_params);
    }

    if (this.use_youtubedl_archive) {
      full_string_array.push('--download-archive', 'archive.txt');
    }

    if (globalArgsExists) {
      full_string_array = full_string_array.concat(this.globalCustomArgs.split(',,'));
    }

    this.simulatedOutput = full_string_array.join(' ');
    return this.simulatedOutput;
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
        const key = format.format_note.replace('p', '');
        if (format.ext === 'mp4' || format.ext === 'mkv' || format.ext === 'webm') {
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

  // modify custom args
  openArgsModifierDialog() {
    const dialogRef = this.dialog.open(ArgModifierDialogComponent, {
      data: {
       initial_args: this.customArgs
      }
    });
    dialogRef.afterClosed().subscribe(new_args => {
      if (new_args !== null && new_args !== undefined) {
        this.customArgs = new_args;
      }
    });
  }

  getCurrentDownload() {
    if (!this.current_download) {
      return;
    }
    const ui_uid = this.current_download['ui_uid'] ? this.current_download['ui_uid'] : this.current_download['uid'];
    this.postsService.getCurrentDownload(this.postsService.session_id, ui_uid).subscribe(res => {
      if (res['download']) {
        if (ui_uid === res['download']['ui_uid']) {
          this.current_download = res['download'];
          this.percentDownloaded = this.current_download.percent_complete;
        }
      } else {
        // console.log('failed to get new download');
      }
    });
  }
}
