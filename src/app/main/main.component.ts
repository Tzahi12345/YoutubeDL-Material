import { Component, OnInit, ElementRef, ViewChild, ViewChildren, QueryList } from '@angular/core';
import {PostsService} from '../posts.services';
import { Observable, Subject } from 'rxjs';
import {FormControl, Validators} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { saveAs } from 'file-saver';
import { YoutubeSearchService, Result } from '../youtube-search.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Platform } from '@angular/cdk/platform';
import { ArgModifierDialogComponent } from 'app/dialogs/arg-modifier-dialog/arg-modifier-dialog.component';
import { RecentVideosComponent } from 'app/components/recent-videos/recent-videos.component';
import { Download, FileType } from 'api-types';

export let audioFilesMouseHovering = false;
export let videoFilesMouseHovering = false;
export let audioFilesOpened = false;
export let videoFilesOpened = false;

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
  autoplay = false;
  customArgsEnabled = false;
  customArgs = null;
  customOutputEnabled = false;
  replaceArgs = false;
  customOutput = null;
  youtubeAuthEnabled = false;
  youtubeUsername = null;
  youtubePassword = null;
  cropFile = false;
  cropFileStart = null;
  cropFileEnd = null;
  urlError = false;
  path: string | string[] = '';
  url = '';
  exists = '';
  percentDownloaded: number;
  autoStartDownload = false;

  // global settings
  fileManagerEnabled = false;
  allowQualitySelect = false;
  downloadOnlyMode = false;
  allowAutoplay = false;
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
  playlists = {'audio': [], 'video': []};
  playlist_thumbnails = {};
  downloading_content = {'audio': {}, 'video': {}};
  downloads: Download[] = [];
  download_uids: string[] = [];
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
  @ViewChild('recentVideos') recentVideos: RecentVideosComponent;
  last_valid_url = '';
  last_url_check = 0;

  argsChangedSubject: Subject<boolean> = new Subject<boolean>();
  simulatedOutput = '';

  constructor(public postsService: PostsService, private youtubeSearch: YoutubeSearchService, public snackBar: MatSnackBar,
    private router: Router, public dialog: MatDialog, private platform: Platform, private route: ActivatedRoute) {
    this.audioOnly = false;
  }

  async configLoad(): Promise<void> {
    await this.loadConfig();
    if (this.autoStartDownload) {
      this.downloadClicked();
    }
  }

  async loadConfig(): Promise<boolean> {
    // loading config
    this.fileManagerEnabled = this.postsService.config['Extra']['file_manager_enabled']
                              && this.postsService.hasPermission('filemanager');
    this.downloadOnlyMode = this.postsService.config['Extra']['download_only_mode'];
    this.allowAutoplay = this.postsService.config['Extra']['allow_autoplay'];
    this.audioFolderPath = this.postsService.config['Downloader']['path-audio'];
    this.videoFolderPath = this.postsService.config['Downloader']['path-video'];
    this.use_youtubedl_archive = this.postsService.config['Downloader']['use_youtubedl_archive'];
    this.globalCustomArgs = this.postsService.config['Downloader']['custom_args'];
    this.youtubeSearchEnabled = this.postsService.config['API'] && this.postsService.config['API']['use_youtube_API'] &&
        this.postsService.config['API']['youtube_API_key'];
    this.youtubeAPIKey = this.youtubeSearchEnabled ? this.postsService.config['API']['youtube_API_key'] : null;
    this.allowQualitySelect = this.postsService.config['Extra']['allow_quality_select'];
    this.allowAdvancedDownload = this.postsService.config['Advanced']['allow_advanced_download']
                                  && this.postsService.hasPermission('advanced_download');
    this.useDefaultDownloadingAgent = this.postsService.config['Advanced']['use_default_downloading_agent'];
    this.customDownloadingAgent = this.postsService.config['Advanced']['custom_downloading_agent'];

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

      if (localStorage.getItem('replaceArgs') !== null) {
        this.replaceArgs = localStorage.getItem('replaceArgs') === 'true';
      }

      if (localStorage.getItem('youtubeAuthEnabled') !== null) {
        this.youtubeAuthEnabled = localStorage.getItem('youtubeAuthEnabled') === 'true';
      }

      // set advanced inputs
      const customArgs = localStorage.getItem('customArgs');
      const customOutput = localStorage.getItem('customOutput');
      const youtubeUsername = localStorage.getItem('youtubeUsername');

      if (customArgs && customArgs !== 'null') { this.customArgs = customArgs }
      if (customOutput && customOutput !== 'null') { this.customOutput = customOutput }
      if (youtubeUsername && youtubeUsername !== 'null') { this.youtubeUsername = youtubeUsername }
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
  ngOnInit(): void {
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

    if (localStorage.getItem('autoplay') !== null) {
      this.autoplay = localStorage.getItem('autoplay') === 'true';
    }

    // check if params exist
    if (this.route.snapshot.paramMap.get('url')) {
      this.url = decodeURIComponent(this.route.snapshot.paramMap.get('url'));
      this.audioOnly = this.route.snapshot.paramMap.get('audioOnly') === 'true';

      // set auto start flag to true
      this.autoStartDownload = true;
    }

    this.argsChangedSubject
      .debounceTime(500)
      .subscribe((should_simulate) => {
        if (should_simulate) this.getSimulatedOutput();
    });
  }

  ngAfterViewInit(): void {
    if (this.youtubeSearchEnabled && this.youtubeAPIKey) {
      this.youtubeSearch.initializeAPI(this.youtubeAPIKey);
      this.attachToInput();
    }
  }

  // download helpers
  downloadHelper(container, type: string, is_playlist = false, force_view = false, navigate_mode = false): void {
    this.downloadingfile = false;
    if (!this.autoplay && !this.downloadOnlyMode && !navigate_mode) {
      // do nothing
      this.reloadRecentVideos();
    } else {
      // if download only mode, just download the file. no redirect
      if (force_view === false && this.downloadOnlyMode && !this.iOS) {
        if (is_playlist) {
          this.downloadPlaylist(container['uid']);
        } else {
          this.downloadFileFromServer(container, type);
        }
        this.reloadRecentVideos();
      } else {
        localStorage.setItem('player_navigator', this.router.url.split(';')[0]);
        if (is_playlist) {
          this.router.navigate(['/player', {playlist_id: container['id'], type: type}]);
        } else {
          this.router.navigate(['/player', {type: type, uid: container['uid']}]);
        }
      }
    }
  }

  // download click handler
  downloadClicked(): void {
    if (!this.ValidURL(this.url)) {
      this.urlError = true;
      return;
    }

    this.urlError = false;

    // get common args
    const customArgs = (this.customArgsEnabled && this.replaceArgs ? this.customArgs : null);
    const additionalArgs = (this.customArgsEnabled && !this.replaceArgs ? this.customArgs : null);
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

    const type = this.audioOnly ? 'audio' : 'video';

    const customQualityConfiguration = type === 'audio' ? this.getSelectedAudioFormat() : this.getSelectedVideoFormat();

    let cropFileSettings = null;

    if (this.cropFile) {
      cropFileSettings = {
        cropFileStart: this.cropFileStart,
        cropFileEnd: this.cropFileEnd
      }
    }

    const selected_quality = this.selectedQuality;
    this.selectedQuality = '';
    this.downloadingfile = true;

    const urls = this.getURLArray(this.url);
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      this.postsService.downloadFile(url, type as FileType, (selected_quality === '' ? null : selected_quality),
        customQualityConfiguration, customArgs, additionalArgs, customOutput, youtubeUsername, youtubePassword, cropFileSettings).subscribe(res => {
          this.current_download = res['download'];
          this.downloads.push(res['download']);
          this.download_uids.push(res['download']['uid']);
      }, () => { // can't access server
        this.downloadingfile = false;
        this.current_download = null;
        this.postsService.openSnackBar('Download failed!', 'OK.');
      });

      if (!this.autoplay && urls.length === 1) {
          const download_queued_message = $localize`Download for ${url}:url: has been queued!`;
          this.postsService.openSnackBar(download_queued_message);
          this.url = '';
          this.downloadingfile = false;
      }
    }
  }

  // download canceled handler
  cancelDownload(download_to_cancel = null): void {
    // if one is provided, cancel that one. otherwise, remove the current one
    if (download_to_cancel) {
      this.removeDownloadFromCurrentDownloads(download_to_cancel)
      return;
    }
    this.downloadingfile = false;
    this.current_download = null;
  }

  getSelectedAudioFormat(): string {
    if (this.selectedQuality === '') { return null; }
    const cachedFormatsExists = this.cachedAvailableFormats[this.url] && this.cachedAvailableFormats[this.url]['formats'];
    if (cachedFormatsExists) {
      return this.selectedQuality['format_id'];
    } else {
      return null;
    }
  }

  getSelectedVideoFormat(): string {
    if (this.selectedQuality === '') { return null; }
    const cachedFormats = this.cachedAvailableFormats[this.url] && this.cachedAvailableFormats[this.url]['formats'];
    if (cachedFormats) {
      if (this.selectedQuality) {
        let selected_video_format = this.selectedQuality['format_id'];
        // add in audio format if necessary
        const audio_missing = !this.selectedQuality['acodec'] || this.selectedQuality['acodec'] === 'none';
        if (audio_missing && cachedFormats['best_audio_format']) selected_video_format += `+${cachedFormats['best_audio_format']}`;
        return selected_video_format;
      }
    }
    return null;
  }

  getDownloadByUID(uid: string) {
    const index = this.downloads.findIndex(download => download.uid === uid);
    if (index !== -1) {
      return this.downloads[index];
    } else {
      return null;
    }
  }

  removeDownloadFromCurrentDownloads(download_to_remove): boolean {
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

  downloadFileFromServer(file, type: string): void {
    const ext = type === 'audio' ? 'mp3' : 'mp4'
    this.downloading_content[type][file.id] = true;
    this.postsService.downloadFileFromServer(file.uid).subscribe(res => {
      this.downloading_content[type][file.id] = false;
      const blob: Blob = res;
      saveAs(blob, decodeURIComponent(file.id) + `.${ext}`);

      if (!this.fileManagerEnabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(file.uid).subscribe(() => {});
      }
    });
  }

  downloadPlaylist(playlist): void {
    this.postsService.downloadPlaylistFromServer(playlist.id).subscribe(res => {
      if (playlist.id) { this.downloading_content[playlist.type][playlist.id] = false };
      const blob: Blob = res;
      saveAs(blob, playlist.name + '.zip');
    });

  }

  clearInput(): void {
    this.url = '';
    this.results_showing = false;
  }

  onInputBlur(): void {
    this.results_showing = false;
  }

  visitURL(url: string): void {
    window.open(url);
  }

  useURL(url: string): void {
    this.results_showing = false;
    this.url = url;
  }

  inputChanged(new_val: string): void {
    if (new_val === '' || !new_val) {
      this.results_showing = false;
    } else {
      if (this.ValidURL(new_val)) {
        this.results_showing = false;
      }
    }
  }

  // checks if url is a valid URL
  ValidURL(str: string): boolean {
    // mark multiple urls as valid but don't get additional info
    const urls = this.getURLArray(str);
    if (urls.length > 1) {
      this.autoplay = false;
      return true;
    }
    
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
        this.argsChanged();
      }
      this.last_valid_url = str;
    }
    return valid;
  }

  getURLInfo(url: string): void {
    // if url is a youtube playlist, skip getting url info
    if (url.includes('playlist')) {
      return;
    }
    if (!this.cachedAvailableFormats[url]) {
      this.cachedAvailableFormats[url] = {};
    }
    if (!(this.cachedAvailableFormats[url] && this.cachedAvailableFormats[url]['formats'])) {
      this.cachedAvailableFormats[url]['formats_loading'] = true;
      this.postsService.getFileFormats([url]).subscribe(res => {
        this.cachedAvailableFormats[url]['formats_loading'] = false;
        const infos = res['result'];
        if (!infos || !infos.formats) {
          this.errorFormats(url);
          return;
        }
        this.cachedAvailableFormats[url]['formats'] = this.getAudioAndVideoFormats(infos.formats);
      }, () => {
        this.errorFormats(url);
      });
    }
  }

  getSimulatedOutput(): void {
    const urls = this.getURLArray(this.url);
    if (urls.length > 1) return;

    // this function should be very similar to downloadClicked()
    const customArgs = (this.customArgsEnabled && this.replaceArgs ? this.customArgs : null);
    const additionalArgs = (this.customArgsEnabled && !this.replaceArgs ? this.customArgs : null);
    const customOutput = (this.customOutputEnabled ? this.customOutput : null);
    const youtubeUsername = (this.youtubeAuthEnabled && this.youtubeUsername ? this.youtubeUsername : null);
    const youtubePassword = (this.youtubeAuthEnabled && this.youtubePassword ? this.youtubePassword : null);

    const type = this.audioOnly ? 'audio' : 'video';

    const customQualityConfiguration = type === 'audio' ? this.getSelectedAudioFormat() : this.getSelectedVideoFormat();

    let cropFileSettings = null;

    if (this.cropFile) {
      cropFileSettings = {
        cropFileStart: this.cropFileStart,
        cropFileEnd: this.cropFileEnd
      }
    }

    this.postsService.generateArgs(this.url, type as FileType, (this.selectedQuality === '' ? null : this.selectedQuality),
      customQualityConfiguration, customArgs, additionalArgs, customOutput, youtubeUsername, youtubePassword, cropFileSettings).subscribe(res => {
        const simulated_args = res['args'];
        if (simulated_args) {
          // hide password if needed
          const passwordIndex = simulated_args.indexOf('--password');
          console.log(passwordIndex);
          if (passwordIndex !== -1 && passwordIndex !== simulated_args.length - 1) {
            simulated_args[passwordIndex + 1] = simulated_args[passwordIndex + 1].replace(/./g, '*');
          }
          this.simulatedOutput = `youtube-dl ${this.url} ${simulated_args.join(' ')}`;
        }
    });
  }

  errorFormats(url: string): void {
    this.cachedAvailableFormats[url]['formats_loading'] = false;
    console.error('Could not load formats for url ' + url);
  }

  attachToInput(): void {
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

  argsChanged(): void {
    this.argsChangedSubject.next(true);
  }

  videoModeChanged(new_val): void {
    this.selectedQuality = '';
    localStorage.setItem('audioOnly', new_val.checked.toString());
    this.argsChanged();
  }

  autoplayChanged(new_val): void {
    localStorage.setItem('autoplay', new_val.checked.toString());
  }

  customArgsEnabledChanged(new_val): void {
    localStorage.setItem('customArgsEnabled', new_val.checked.toString());
    this.argsChanged();
  }

  replaceArgsChanged(new_val): void {
    localStorage.setItem('replaceArgs', new_val.checked.toString());
    this.argsChanged();
  }

  customOutputEnabledChanged(new_val): void {
    localStorage.setItem('customOutputEnabled', new_val.checked.toString());
    this.argsChanged();
  }

  youtubeAuthEnabledChanged(new_val): void {
    localStorage.setItem('youtubeAuthEnabled', new_val.checked.toString());
    this.argsChanged();
  }

  getAudioAndVideoFormats(formats): void {
    const audio_formats: any = {};
    const video_formats: any = {};

    for (let i = 0; i < formats.length; i++) {
      const format_obj = {type: null};

      const format = formats[i];
      const format_type = (format.vcodec === 'none') ? 'audio' : 'video';

      format_obj.type = format_type;
      if (format_obj.type === 'audio' && format.abr) {
        const key = format.abr.toString() + 'K';
        format_obj['key'] = key;
        format_obj['bitrate'] = format.abr;
        format_obj['format_id'] = format.format_id;
        format_obj['ext'] = format.ext;
        format_obj['label'] = key;

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
        const key = `${format.height}p${Math.round(format.fps)}`;
        if (format.ext === 'mp4' || format.ext === 'mkv' || format.ext === 'webm') {
          format_obj['key'] = key;
          format_obj['height'] = format.height;
          format_obj['acodec'] = format.acodec;
          format_obj['format_id'] = format.format_id;
          format_obj['label'] = key;
          format_obj['fps'] = Math.round(format.fps);

          // no acodec means no overwrite
          if (!(video_formats[key]) || format_obj['acodec'] !== 'none') {
            video_formats[key] = format_obj;
          }
        }
      }
    }

    const parsed_formats: any = {};

    parsed_formats['best_audio_format'] = this.getBestAudioFormatForMp4(audio_formats);

    parsed_formats['video'] = Object.values(video_formats);
    parsed_formats['audio'] = Object.values(audio_formats);

    parsed_formats['video'] = parsed_formats['video'].sort((a, b) => b.height - a.height || b.fps - a.fps);
    parsed_formats['audio'] = parsed_formats['audio'].sort((a, b) => b.bitrate - a.bitrate);

    return parsed_formats;
  }

  getBestAudioFormatForMp4(audio_formats): void {
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

  // modify custom args
  openArgsModifierDialog(): void {
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

  getCurrentDownload(): void {
    if (!this.current_download) {
      return;
    }
    this.postsService.getCurrentDownload(this.current_download['uid']).subscribe(res => {
      if (res['download']) {
        this.current_download = res['download'];
        this.percentDownloaded = this.current_download.percent_complete;

        if (this.current_download['finished'] && !this.current_download['error']) {
          const container = this.current_download['container'];
          const is_playlist = this.current_download['file_uids'].length > 1;    
          this.downloadHelper(container, this.current_download['type'], is_playlist, false);
          this.current_download = null;
        } else if (this.current_download['finished'] && this.current_download['error']) {
          this.downloadingfile = false;
          this.current_download = null;
          this.postsService.openSnackBar('Download failed!', 'OK.');
        }
      } else {
        // console.log('failed to get new download');
      }
    });
  }

  reloadRecentVideos(): void {
    this.postsService.files_changed.next(true);
  }

  getURLArray(url_str: string): Array<string> {
    let lines = url_str.split('\n');
    lines = lines.filter(line => line);
    return lines;
  }
}
