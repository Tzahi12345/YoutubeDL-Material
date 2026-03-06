import { Component, OnInit, HostListener, OnDestroy, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { VgApiService } from '@videogular/ngx-videogular/core';
import { PostsService } from 'app/posts.services';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ShareMediaDialogComponent } from '../dialogs/share-media-dialog/share-media-dialog.component';
import { DatabaseFile, FileType, FileTypeFilter, Playlist, Sort } from '../../api-types';
import { TwitchChatComponent } from 'app/components/twitch-chat/twitch-chat.component';
import { VideoInfoDialogComponent } from 'app/dialogs/video-info-dialog/video-info-dialog.component';
import { saveAs } from 'file-saver';
import { filter, take } from 'rxjs/operators';

export interface IMedia {
  title: string;
  src: string;
  type: string;
  label: string;
  url: string;
  uid?: string;
}

const AUTOPLAY_STORAGE_KEY = 'player_autoplay_enabled';
const REPEAT_STORAGE_KEY = 'player_repeat_enabled';

@Component({
    selector: 'app-player',
    templateUrl: './player.component.html',
    styleUrls: ['./player.component.css'],
    standalone: false
})
export class PlayerComponent implements OnInit, AfterViewInit, OnDestroy {

  playlist: Array<IMedia> = [];
  original_playlist: string = null;
  playlist_updating = false;

  show_player = false;

  currentIndex = 0;
  currentItem: IMedia = null;
  api: VgApiService;
  api_ready = false;

  // params
  uids: string[];
  type: FileType;
  playlist_id = null; // used for playlists (not subscription)
  file_objs: DatabaseFile[] = []; // used for playlists
  uid = null; // used for non-subscription files (audio, video, playlist)
  subscription = null;
  sub_id = null;
  subPlaylist = null;
  uuid = null; // used for sharing in multi-user mode, uuid is the user that downloaded the video
  timestamp = null;
  auto = null;
  queue_sort_by = 'registered';
  queue_sort_order = -1;
  queue_file_type_filter: FileTypeFilter = null;
  queue_favorite_filter = false;
  queue_search = null;
  queue_sub_id = null;

  db_playlist: Playlist = null;
  db_file: DatabaseFile = null;

  baseStreamPath = null;
  audioFolderPath = null;
  videoFolderPath = null;
  subscriptionFolderPath = null;

  // url-mode params
  url = null;
  name = null;

  downloading = false;

  save_volume_timer = null;
  original_volume = null;

  autoplay_enabled = false;
  repeat_enabled = false;
  autoplay_queue_loading = false;
  autoplay_queue_initialized = false;
  pending_autoplay_advance = false;

  @ViewChild('twitchchat') twitchChat: TwitchChatComponent;

  ngOnInit(): void {
    this.initPlaybackModeToggles();
    this.playlist_id = this.route.snapshot.paramMap.get('playlist_id');
    this.uid = this.route.snapshot.paramMap.get('uid');
    this.sub_id = this.route.snapshot.paramMap.get('sub_id');
    this.url = this.route.snapshot.paramMap.get('url');
    this.name = this.route.snapshot.paramMap.get('name');
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.timestamp = this.route.snapshot.paramMap.get('timestamp');
    this.auto = this.route.snapshot.paramMap.get('auto');
    this.queue_sort_by = this.route.snapshot.paramMap.get('queue_sort_by') ?? 'registered';
    this.queue_sort_order = this.parseSortOrder(this.route.snapshot.paramMap.get('queue_sort_order'));
    this.queue_file_type_filter = this.parseFileTypeFilter(this.route.snapshot.paramMap.get('queue_file_type_filter'));
    this.queue_favorite_filter = this.route.snapshot.paramMap.get('queue_favorite_filter') === 'true';
    this.queue_search = this.route.snapshot.paramMap.get('queue_search');
    this.queue_sub_id = this.route.snapshot.paramMap.get('queue_sub_id');

    // loading config
    if (this.postsService.initialized) {
      this.processConfig();
    } else {
      this.postsService.service_initialized
        .pipe(filter(Boolean), take(1))
        .subscribe(() => this.processConfig());
    }
  }

  ngAfterViewInit(): void {
    this.cdr.detectChanges();
    // On hard refresh, AppComponent may not have assigned the shared sidenav yet.
    setTimeout(() => this.postsService.sidenav?.close());
  }

  ngOnDestroy(): void {
    // prevents volume save feature from running in the background
    clearInterval(this.save_volume_timer);
  }

  constructor(public postsService: PostsService, private route: ActivatedRoute, private dialog: MatDialog, private router: Router,
              private cdr: ChangeDetectorRef) {

  }

  processConfig(): void {
    this.baseStreamPath = this.postsService.path;
    this.audioFolderPath = this.postsService.config['Downloader']['path-audio'];
    this.videoFolderPath = this.postsService.config['Downloader']['path-video'];
    this.subscriptionFolderPath = this.postsService.config['Subscriptions']['subscriptions_base_path'];

    if (this.sub_id) {
      this.getSubscription();
    } else if (this.playlist_id) {
      this.getPlaylistFiles();
    } else if (this.uid) {
      this.getFile();
    } 

    if (this.url) {
      // if a url is given, just stream the URL
      this.playlist = [];
      const imedia: IMedia = {
        title: this.name,
        label: this.name,
        src: this.url,
        type: 'video/mp4',
        url: this.url,
        uid: this.uid
      }
      this.playlist.push(imedia);
      this.updateCurrentItem(this.playlist[0], 0);
      this.show_player = true;
    }
  }

  getFile(): void {
    this.postsService.getFile(this.uid, this.uuid).subscribe(res => {
      this.db_file = res['file'];
      if (!this.db_file) {
        this.postsService.openSnackBar($localize`Failed to get file information from the server.`, 'Dismiss');
        return;
      }
      this.postsService.incrementViewCount(this.db_file['uid'], null, this.uuid).subscribe(() => undefined, err => {
        console.error('Failed to increment view count');
        console.error(err);
      });
      // regular video/audio file (not playlist)
      this.uids = [this.db_file['uid']];
      this.type = this.db_file['isAudio'] ? 'audio' as FileType : 'video' as FileType;
      this.parseFileNames();
    }, err => {
      console.error(err);
      this.postsService.openSnackBar($localize`Failed to get file information from the server.`, 'Dismiss');
    });
  }

  getSubscription(): void {
    this.postsService.getSubscription(this.sub_id).subscribe(res => {
      const subscription = res['subscription'];
      this.subscription = subscription;
      this.type = this.subscription.type;
      this.uids = this.subscription.videos.map(video => video['uid']);
      this.parseFileNames();
    }, () => {
      // TODO: Make translatable
      this.postsService.openSnackBar(`Failed to find subscription ${this.sub_id}`, 'Dismiss');
    });
  }

  getPlaylistFiles(): void {
    this.postsService.getPlaylist(this.playlist_id, this.uuid, true).subscribe(res => {
      if (res['playlist']) {
        this.db_playlist = res['playlist'];
        this.file_objs = res['file_objs'];
        this.uids = this.db_playlist.uids;
        this.type = res['type'];
        this.show_player = true;
        this.parseFileNames();
      } else {
        this.postsService.openSnackBar($localize`Failed to load playlist!`);
      }
    }, () => {
      this.postsService.openSnackBar($localize`Failed to load playlist!`);
    });
  }

  parseFileNames(): void {
    this.playlist = [];
    this.autoplay_queue_initialized = false;
    if (!this.queue_file_type_filter && this.db_file) {
      this.queue_file_type_filter = this.db_file.isAudio ? FileTypeFilter.AUDIO_ONLY : FileTypeFilter.VIDEO_ONLY;
    }
    for (let i = 0; i < this.uids.length; i++) {
      const file_obj = this.playlist_id ? this.file_objs[i]
                     : this.sub_id ? this.subscription['videos'][i]
                     : this.db_file;

      const mediaObject: IMedia = this.createMediaObject(file_obj);
      this.playlist.push(mediaObject);
    }
    if (this.db_playlist && this.db_playlist['randomize_order']) {
      this.shuffleArray(this.playlist);
    }
    const currentUID = this.currentItem?.uid;
    const currentIndex = currentUID ? this.playlist.findIndex(file_obj => file_obj.uid === currentUID) : this.currentIndex;
    this.currentIndex = currentIndex >= 0 ? currentIndex : 0;
    this.currentItem = this.playlist[this.currentIndex];
    this.original_playlist = JSON.stringify(this.playlist);
    this.show_player = true;

    if (this.autoplay_enabled) {
      this.ensureAutoplayQueueReady();
    }
  }

  onPlayerReady(api: VgApiService): void {
      this.api = api;
      this.api_ready = true;
      this.cdr.detectChanges();

      // checks if volume has been previously set. if so, use that as default
      if (localStorage.getItem('player_volume')) {
        this.api.volume = parseFloat(localStorage.getItem('player_volume'));
      }

      this.save_volume_timer = setInterval(() => this.saveVolume(this.api), 2000)

      this.api.getDefaultMedia().subscriptions.loadedMetadata.subscribe(this.playVideo.bind(this));
      this.api.getDefaultMedia().subscriptions.ended.subscribe(this.nextVideo.bind(this));

      if (this.timestamp) {
        this.api.seekTime(+this.timestamp);
      }
  }

  saveVolume(api: VgApiService): void {
    if (this.original_volume !== api.volume) {
      localStorage.setItem('player_volume', api.volume)
      this.original_volume = api.volume;
    }
  }

  nextVideo(): void {
      if (this.repeat_enabled) {
        this.repeatCurrentVideo();
        return;
      }

      if (!this.autoplay_enabled) {
        return;
      }

      if (this.advanceToNextVideo()) {
        return;
      }

      if (this.shouldAutoloadWholeLibraryQueue()) {
        this.pending_autoplay_advance = true;
        this.ensureAutoplayQueueReady();
      }
  }

  updateCurrentItem(newCurrentItem: IMedia, newCurrentIndex: number) {
    this.currentItem  = newCurrentItem;
    this.currentIndex = newCurrentIndex;
  }

  playVideo(): void {
      this.api.play();
  }

  onClickPlaylistItem(item: IMedia, index: number): void {
      this.updateCurrentItem(item, index);
  }

  toggleAutoplay(): void {
    this.autoplay_enabled = !this.autoplay_enabled;
    if (this.autoplay_enabled) {
      this.repeat_enabled = false;
      this.saveRepeatMode();
      this.ensureAutoplayQueueReady();
    }
    this.saveAutoplayMode();
  }

  toggleRepeat(): void {
    this.repeat_enabled = !this.repeat_enabled;
    if (this.repeat_enabled) {
      this.autoplay_enabled = false;
      this.saveAutoplayMode();
      this.pending_autoplay_advance = false;
    }
    this.saveRepeatMode();
  }

  getFileNames(): string[] {
    const fileNames = [];
    for (let i = 0; i < this.playlist.length; i++) {
      fileNames.push(this.playlist[i].title);
    }
    return fileNames;
  }

  decodeURI(uri: string): string {
    return decodeURI(uri);
  }

  downloadContent(): void {
    const zipName = this.db_playlist.name;
    this.downloading = true;
    this.postsService.downloadPlaylistFromServer(this.playlist_id, this.uuid).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, zipName + '.zip');
    }, err => {
      console.error(err);
      this.downloading = false;
    });
  }

  downloadFile(): void {
    const filename = this.playlist[0].title;
    const ext = (this.playlist[0].type === 'audio/mp3') ? '.mp3' : '.mp4';
    this.downloading = true;
    this.postsService.downloadFileFromServer(this.uid, this.uuid).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, filename + ext);
    }, err => {
      console.error(err);
      this.downloading = false;
    });
  }

  playlistPostCreationHandler(playlistID: string): void {
    // changes the route without moving from the current view or
    // triggering a navigation event
    this.playlist_id = playlistID;
    this.router.navigateByUrl(this.router.url + ';id=' + playlistID);
  }

  drop(event: CdkDragDrop<string[]>): void {
    moveItemInArray(this.playlist, event.previousIndex, event.currentIndex);
  }

   playlistChanged(): boolean {
    return JSON.stringify(this.playlist) !== this.original_playlist;
  }

  openShareDialog(): void {
    const dialogRef = this.dialog.open(ShareMediaDialogComponent, {
      data: {
        uid: this.playlist_id ? this.playlist_id : this.uid,
        sharing_enabled: this.playlist_id ? this.db_playlist.sharingEnabled : this.db_file.sharingEnabled,
        is_playlist: !!this.playlist_id,
        uuid: this.postsService.isLoggedIn ? this.postsService.user.uid : this.uuid,
        current_timestamp: this.api.time.current
      },
      width: '60vw'
    });

    dialogRef.afterClosed().subscribe(() => {
      if (!this.playlist_id) {
        this.getFile();
      } else {
        this.getPlaylistFiles();
      }
    });
  }
  
  openFileInfoDialog(): void {
    let file_obj = this.db_file;
    const original_uid = this.currentItem.uid;
    if (this.db_playlist) {
      const idx = this.getPlaylistFileIndexUID(original_uid);
      file_obj = this.file_objs[idx];
    }
    const dialogRef = this.dialog.open(VideoInfoDialogComponent, {
      data: {
        file: file_obj,
      },
      minWidth: '50vw'
    });

    dialogRef.afterClosed().subscribe(() => {
      if (this.db_file) this.db_file = dialogRef.componentInstance.file;
      else if (this.db_playlist) {
        const idx = this.getPlaylistFileIndexUID(original_uid);
        this.file_objs[idx] = dialogRef.componentInstance.file;
      } 
    });
  }

  getPlaylistFileIndexUID(uid: string): number {
    return this.file_objs.findIndex(file_obj => file_obj['uid'] === uid);
  }

  setPlaybackTimestamp(time: number): void {
    this.api.seekTime(time);
  }

  togglePlayback(to_play: boolean): void {
    if (to_play) {
      this.api.play();
    } else {
      this.api.pause();
    }
  }

  setPlaybackRate(speed: number): void {
    this.api.playbackRate = speed;
  }

  initPlaybackModeToggles(): void {
    this.autoplay_enabled = localStorage.getItem(AUTOPLAY_STORAGE_KEY) === 'true';
    this.repeat_enabled = localStorage.getItem(REPEAT_STORAGE_KEY) === 'true';
    if (this.autoplay_enabled && this.repeat_enabled) {
      this.repeat_enabled = false;
      this.saveRepeatMode();
    }
  }

  saveAutoplayMode(): void {
    localStorage.setItem(AUTOPLAY_STORAGE_KEY, `${this.autoplay_enabled}`);
  }

  saveRepeatMode(): void {
    localStorage.setItem(REPEAT_STORAGE_KEY, `${this.repeat_enabled}`);
  }

  parseSortOrder(sortOrder: string): number {
    return sortOrder === '1' ? 1 : -1;
  }

  parseFileTypeFilter(fileTypeFilter: string): FileTypeFilter {
    if (fileTypeFilter === FileTypeFilter.AUDIO_ONLY || fileTypeFilter === FileTypeFilter.VIDEO_ONLY || fileTypeFilter === FileTypeFilter.BOTH) {
      return fileTypeFilter;
    }
    return null;
  }

  createMediaObject(file_obj: DatabaseFile): IMedia {
    const mime_type = file_obj.isAudio ? 'audio/mp3' : 'video/mp4';
    const mediaObject: IMedia = {
      title: file_obj.title,
      src: this.createStreamURL(file_obj.uid),
      type: mime_type,
      label: file_obj.title,
      url: file_obj.url,
      uid: file_obj.uid
    };
    return mediaObject;
  }

  createStreamURL(uid: string): string {
    const baseLocation = 'stream/';
    let fullLocation = this.baseStreamPath + baseLocation + `?test=test&uid=${uid}`;

    if (this.postsService.isLoggedIn) {
      fullLocation += `&jwt=${this.postsService.token}`;
    } else if (this.postsService.auth_token) {
      fullLocation += `&apiKey=${this.postsService.auth_token}`;
    }

    if (this.uuid) {
      fullLocation += `&uuid=${this.uuid}`;
    }

    if (this.sub_id) {
      fullLocation += `&sub_id=${this.sub_id}`;
    } else if (this.playlist_id) {
      fullLocation += `&playlist_id=${this.playlist_id}`;
    }

    return fullLocation;
  }

  shouldAutoloadWholeLibraryQueue(): boolean {
    return !!this.uid && !this.playlist_id && !this.sub_id && this.playlist.length <= 1;
  }

  ensureAutoplayQueueReady(): void {
    if (!this.shouldAutoloadWholeLibraryQueue() || this.autoplay_queue_loading || this.autoplay_queue_initialized) {
      return;
    }

    this.autoplay_queue_loading = true;
    const sort: Sort = {
      by: this.queue_sort_by,
      order: this.queue_sort_order
    };
    const fileTypeFilter = this.resolveQueueFileTypeFilter();
    const textSearch = this.queue_search?.trim() ? this.queue_search.trim() : null;
    const queueSubID = this.queue_sub_id || null;

    this.postsService.getAllFiles(sort, null, textSearch, fileTypeFilter, this.queue_favorite_filter, queueSubID).subscribe(res => {
      this.autoplay_queue_loading = false;
      const files = res['files'] ?? [];
      if (files.length === 0) return;

      const current_uid = this.currentItem?.uid || this.uid;
      const newPlaylist = files.map(file_obj => this.createMediaObject(file_obj));
      const currentIndex = newPlaylist.findIndex(file_obj => file_obj.uid === current_uid);
      if (currentIndex === -1) return;

      this.playlist = newPlaylist;
      this.currentIndex = currentIndex;
      this.currentItem = this.playlist[currentIndex];
      this.original_playlist = JSON.stringify(this.playlist);
      this.autoplay_queue_initialized = true;

      if (this.pending_autoplay_advance) {
        this.pending_autoplay_advance = false;
        this.advanceToNextVideo();
      }
    }, err => {
      console.error('Failed to load autoplay queue');
      console.error(err);
      this.autoplay_queue_loading = false;
      this.pending_autoplay_advance = false;
    });
  }

  resolveQueueFileTypeFilter(): FileTypeFilter {
    if (this.queue_file_type_filter) {
      return this.queue_file_type_filter;
    }
    if (this.db_file) {
      return this.db_file.isAudio ? FileTypeFilter.AUDIO_ONLY : FileTypeFilter.VIDEO_ONLY;
    }
    return FileTypeFilter.BOTH;
  }

  repeatCurrentVideo(): void {
    if (!this.api) return;
    this.api.seekTime(0);
    this.api.play();
  }

  advanceToNextVideo(): boolean {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.playlist.length) {
      return false;
    }
    this.updateCurrentItem(this.playlist[nextIndex], nextIndex);
    return true;
  }

  shuffleArray(array: unknown[]): void {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
