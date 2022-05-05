import { Component, OnInit, HostListener, OnDestroy, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { VgApiService } from '@videogular/ngx-videogular/core';
import { PostsService } from 'app/posts.services';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ShareMediaDialogComponent } from '../dialogs/share-media-dialog/share-media-dialog.component';
import { FileType } from '../../api-types';
import { TwitchChatComponent } from 'app/components/twitch-chat/twitch-chat.component';
import { VideoInfoDialogComponent } from 'app/dialogs/video-info-dialog/video-info-dialog.component';

export interface IMedia {
  title: string;
  src: string;
  type: string;
  label: string;
  url: string;
}

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css']
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
  uid = null; // used for non-subscription files (audio, video, playlist)
  subscription = null;
  sub_id = null;
  subPlaylist = null;
  uuid = null; // used for sharing in multi-user mode, uuid is the user that downloaded the video
  timestamp = null;
  auto = null;

  db_playlist = null;
  db_file = null;

  baseStreamPath = null;
  audioFolderPath = null;
  videoFolderPath = null;
  subscriptionFolderPath = null;

  // url-mode params
  url = null;
  name = null;

  innerWidth: number;

  downloading = false;

  save_volume_timer = null;
  original_volume = null;

  @ViewChild('twitchchat') twitchChat: TwitchChatComponent;

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.innerWidth = window.innerWidth;
  }

  ngOnInit(): void {
    this.innerWidth = window.innerWidth;

    this.playlist_id = this.route.snapshot.paramMap.get('playlist_id');
    this.uid = this.route.snapshot.paramMap.get('uid');
    this.sub_id = this.route.snapshot.paramMap.get('sub_id');
    this.url = this.route.snapshot.paramMap.get('url');
    this.name = this.route.snapshot.paramMap.get('name');
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    this.timestamp = this.route.snapshot.paramMap.get('timestamp');
    this.auto = this.route.snapshot.paramMap.get('auto');

    // loading config
    if (this.postsService.initialized) {
      this.processConfig();
    } else {
      this.postsService.service_initialized.subscribe(init => { // loads settings
        if (init) {
          this.processConfig();
        }
      });
    }
  }

  ngAfterViewInit() {
    this.cdr.detectChanges();
    this.postsService.sidenav.close();
  }

  ngOnDestroy() {
    // prevents volume save feature from running in the background
    clearInterval(this.save_volume_timer);
  }

  constructor(public postsService: PostsService, private route: ActivatedRoute, private dialog: MatDialog, private router: Router,
              public snackBar: MatSnackBar, private cdr: ChangeDetectorRef) {

  }
  processConfig() {
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
        url: this.url
      }
      this.playlist.push(imedia);
      this.currentItem = this.playlist[0];
      this.currentIndex = 0;
      this.show_player = true;
    }
  }

  getFile() {
    this.postsService.getFile(this.uid, null, this.uuid).subscribe(res => {
      this.db_file = res['file'];
      if (!this.db_file) {
        this.openSnackBar('Failed to get file information from the server.', 'Dismiss');
        return;
      }
      this.postsService.incrementViewCount(this.db_file['uid'], null, this.uuid).subscribe(res => {}, err => {
        console.error('Failed to increment view count');
        console.error(err);
      });
      // regular video/audio file (not playlist)
      this.uids = [this.db_file['uid']];
      this.type = this.db_file['isAudio'] ? 'audio' as FileType : 'video' as FileType;
      this.parseFileNames();
    });
  }

  getSubscription() {
    this.postsService.getSubscription(this.sub_id).subscribe(res => {
      const subscription = res['subscription'];
      this.subscription = subscription;
      this.type === this.subscription.type;
      this.uids = this.subscription.videos.map(video => video['uid']);
      this.parseFileNames();
    }, err => {
      this.openSnackBar(`Failed to find subscription ${this.sub_id}`, 'Dismiss');
    });
  }

  getPlaylistFiles() {
    this.postsService.getPlaylist(this.playlist_id, this.uuid, true).subscribe(res => {
      if (res['playlist']) {
        this.db_playlist = res['playlist'];
        this.db_playlist['file_objs'] = res['file_objs'];
        this.uids = this.db_playlist.uids;
        this.type = res['type'];
        this.show_player = true;
        this.parseFileNames();
      } else {
        this.openSnackBar('Failed to load playlist!', '');
      }
    }, err => {
      this.openSnackBar('Failed to load playlist!', '');
    });
  }

  parseFileNames() {    
    this.playlist = [];
    for (let i = 0; i < this.uids.length; i++) {
      let file_obj = null;
      if (this.playlist_id) {
        file_obj = this.db_playlist['file_objs'][i];
      } else if (this.sub_id) {
        file_obj = this.subscription['videos'][i];
      } else {
        file_obj = this.db_file;
      }

      const mime_type = file_obj.isAudio ? 'audio/mp3' : 'video/mp4' 

      let baseLocation = 'stream/';
      let fullLocation = this.baseStreamPath + baseLocation + `?test=test&uid=${file_obj['uid']}`;

      if (this.postsService.isLoggedIn) {
        fullLocation += `&jwt=${this.postsService.token}`;
      }
      
      if (this.uuid) {
        fullLocation += `&uuid=${this.uuid}`;
      }

      if (this.sub_id) {
        fullLocation += `&sub_id=${this.sub_id}`;
      } else if (this.playlist_id) {
        fullLocation += `&playlist_id=${this.playlist_id}`;
      }

      const mediaObject: IMedia = {
        title: file_obj['title'],
        src: fullLocation,
        type: mime_type,
        label: file_obj['title'],
        url: file_obj['url']
      }
      this.playlist.push(mediaObject);
    }
    if (this.db_playlist && this.db_playlist['randomize_order']) {
      this.shuffleArray(this.playlist);
    }
    this.currentItem = this.playlist[this.currentIndex];
    this.original_playlist = JSON.stringify(this.playlist);
    this.show_player = true;
  }

  onPlayerReady(api: VgApiService) {
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

  saveVolume(api) {
    if (this.original_volume !== api.volume) {
      localStorage.setItem('player_volume', api.volume)
      this.original_volume = api.volume;
    }
  }

  nextVideo() {
      if (this.currentIndex === this.playlist.length - 1) {
        // dont continue playing
          // this.currentIndex = 0;
          return;
      }

      this.currentIndex++;
      this.currentItem = this.playlist[ this.currentIndex ];
  }

  playVideo() {
      this.api.play();
  }

  onClickPlaylistItem(item: IMedia, index: number) {
      // console.log('new current item is ' + item.title + ' at index ' + index);
      this.currentIndex = index;
      this.currentItem = item;
  }

  getFileNames() {
    const fileNames = [];
    for (let i = 0; i < this.playlist.length; i++) {
      fileNames.push(this.playlist[i].title);
    }
    return fileNames;
  }

  decodeURI(string) {
    return decodeURI(string);
  }

  downloadContent() {
    const zipName = this.db_playlist.name;
    this.downloading = true;
    this.postsService.downloadPlaylistFromServer(this.playlist_id, this.uuid).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, zipName + '.zip');
    }, err => {
      console.log(err);
      this.downloading = false;
    });
  }

  downloadFile() {
    const filename = this.playlist[0].title;
    const ext = (this.playlist[0].type === 'audio/mp3') ? '.mp3' : '.mp4';
    this.downloading = true;
    this.postsService.downloadFileFromServer(this.uid, this.uuid).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, filename + ext);
    }, err => {
      console.log(err);
      this.downloading = false;
    });
  }

  playlistPostCreationHandler(playlistID) {
    // changes the route without moving from the current view or
    // triggering a navigation event
    this.playlist_id = playlistID;
    this.router.navigateByUrl(this.router.url + ';id=' + playlistID);
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.playlist, event.previousIndex, event.currentIndex);
  }

   playlistChanged() {
    return JSON.stringify(this.playlist) !== this.original_playlist;
  }

  openShareDialog() {
    const dialogRef = this.dialog.open(ShareMediaDialogComponent, {
      data: {
        uid: this.playlist_id ? this.playlist_id : this.uid,
        sharing_enabled: this.playlist_id ? this.db_playlist.sharingEnabled : this.db_file.sharingEnabled,
        is_playlist: !!this.playlist_id,
        uuid: this.postsService.isLoggedIn ? this.postsService.user.uid : null,
        current_timestamp: this.api.time.current
      },
      width: '60vw'
    });

    dialogRef.afterClosed().subscribe(res => {
      if (!this.playlist_id) {
        this.getFile();
      } else {
        this.getPlaylistFiles();
      }
    });
  }
  
  openFileInfoDialog() {
    this.dialog.open(VideoInfoDialogComponent, {
      data: {
        file: this.db_file,
      },
      minWidth: '50vw'
    })
  }

  setPlaybackTimestamp(time) {
    this.api.seekTime(time);
  }

  togglePlayback(to_play) {
    if (to_play) {
      this.api.play();
    } else {
      this.api.pause();
    }
  }

  setPlaybackRate(speed) {
    this.api.playbackRate = speed;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // snackbar helper
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
